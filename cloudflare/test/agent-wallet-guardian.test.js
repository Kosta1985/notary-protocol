import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {DatabaseSync} from 'node:sqlite';
import {handleAgentWallet,agentWalletErrorResponse} from '../src/agent-wallet.js';
import {handleWalletGuardian,walletGuardianErrorResponse} from '../src/wallet-guardian.js';
import {createSignedAgentRequest} from '../../examples/agent-wallet/signed-client.mjs';

const ORIGIN='https://accordtrace.test';

function d1(sqlite){return{
  prepare(sql){let args=[];const query=()=>{const stmt=sqlite.prepare(sql);const parameters=Object.fromEntries(args.map((v,i)=>[String(i+1),v]));return{stmt,parameters}};return{
    bind(...values){args=values;return this},
    async first(){const{stmt,parameters}=query();return stmt.get(parameters)||null},
    async all(){const{stmt,parameters}=query();return{results:stmt.all(parameters)}},
    async run(){const{stmt,parameters}=query();const out=stmt.run(parameters);return{meta:{changes:Number(out.changes)},success:true}}
  }},
  async batch(statements){sqlite.exec('BEGIN');try{const out=[];for(const statement of statements)out.push(await statement.run());sqlite.exec('COMMIT');return out}catch(error){sqlite.exec('ROLLBACK');throw error}}
}}
async function keypair(){return crypto.subtle.generateKey({name:'Ed25519'},true,['sign','verify']);}
async function publicPem(publicKey){const b64=Buffer.from(await crypto.subtle.exportKey('spki',publicKey)).toString('base64');return`-----BEGIN PUBLIC KEY-----\n${b64.match(/.{1,64}/g).join('\n')}\n-----END PUBLIC KEY-----`;}

async function setup(t){
  const db=new DatabaseSync(':memory:');t.after(()=>db.close());
  for(const file of ['0001_receipts.sql','0005_agent_security.sql','0022_agent_wallet_treasury.sql','0023_agent_wallet_rate_limits.sql','0024_agent_wallet_settlement_guards.sql','0025_agent_wallet_guardian_settlement.sql'])db.exec(fs.readFileSync(new URL(`../migrations/${file}`,import.meta.url),'utf8'));
  const alpha={id:'ACCORD-AGENT-ALPHA',pair:await keypair()};
  const beta={id:'ACCORD-AGENT-BETA',pair:await keypair()};
  const now=new Date().toISOString();
  for(const agent of [alpha,beta])db.prepare('INSERT INTO agent_passports(id,public_key,last_signed_at,created_at,updated_at) VALUES(?,?,?,?,?)').run(agent.id,await publicPem(agent.pair.publicKey),now,now,now);
  const env={
    DB:d1(db),WALLET_MODE:'testnet',WALLET_PROVIDER:'accord_test',WALLET_NETWORK:'accord:testnet',WALLET_CHAIN_ID:'0',TEST_WALLET_INITIAL_USDC_ATOMIC:'100000000',
    FEATURE_AGENT_WALLETS:'true',FEATURE_AGENT_PAYMENTS:'true',FEATURE_AGENT_TREASURY:'true',FEATURE_ECONOMIC_TRUST:'true',FEATURE_GUARDIAN_CONTROLS:'true',WALLET_OPERATOR_TOKEN:'operator-test-only'
  };
  let nonce=0;
  async function invoke(agent,path,{method='GET',body,idempotencyKey}={}){
    const request=await createSignedAgentRequest({baseUrl:ORIGIN,passportId:agent.id,privateKey:agent.pair.privateKey,path,method,body,idempotencyKey,nonce:`nonce_${agent.id}_${++nonce}`});
    try{const response=await handleAgentWallet(request,env,new URL(request.url));return{status:response.status,body:await response.json()};}
    catch(error){const response=agentWalletErrorResponse(error);return{status:response.status,body:await response.json()};}
  }
  async function guardian(paymentId,action,{reason='guardian test',token='operator-test-only',rawBody}={}){
    const body=rawBody??JSON.stringify({reason});
    const request=new Request(`${ORIGIN}/api/v1/wallet-admin/payments/${paymentId}/${action}`,{method:'POST',headers:{authorization:`Bearer ${token}`,'content-type':'application/json'},body});
    try{const response=await handleWalletGuardian(request,env,new URL(request.url));return{status:response.status,body:await response.json()};}
    catch(error){const response=walletGuardianErrorResponse(error);return{status:response.status,body:await response.json()};}
  }
  async function freeze(walletId){
    const request=new Request(`${ORIGIN}/api/v1/wallet-admin/wallets/${walletId}/freeze`,{method:'POST',headers:{authorization:'Bearer operator-test-only','content-type':'application/json'},body:JSON.stringify({reason:'guardian test freeze'})});
    try{const response=await handleAgentWallet(request,env,new URL(request.url));return{status:response.status,body:await response.json()};}
    catch(error){const response=agentWalletErrorResponse(error);return{status:response.status,body:await response.json()};}
  }
  const alphaWallet=await invoke(alpha,'/api/v1/agent/wallet',{method:'POST',body:{}});
  const betaWallet=await invoke(beta,'/api/v1/agent/wallet',{method:'POST',body:{}});
  assert.equal(alphaWallet.status,201);assert.equal(betaWallet.status,201);
  return{db,env,alpha,beta,alphaWallet:alphaWallet.body.wallet,betaWallet:betaWallet.body.wallet,invoke,guardian,freeze};
}
function balance(db,passportId){return db.prepare(`SELECT b.available_atomic AS amount FROM wallet_balances b JOIN agent_wallets w ON w.id=b.wallet_id WHERE w.passport_id=? AND b.asset='USDC'`).get(passportId).amount;}
async function pending60(h,key='guardian-pay-0001'){
  const result=await h.invoke(h.alpha,'/api/v1/agent/payments',{method:'POST',idempotencyKey:key,body:{recipientAgentId:h.beta.id,amount:'60',asset:'USDC',purpose:'AGENT_TASK_SETTLEMENT',taskId:`task_${key}`}});
  assert.equal(result.status,202);assert.equal(result.body.payment.status,'APPROVAL_REQUIRED');return result.body.payment.id;
}

test('Guardian approval confirms a high-value payment only from existing funded balance',async t=>{
  const h=await setup(t);const paymentId=await pending60(h);
  assert.equal(balance(h.db,h.alpha.id),100000000);assert.equal(balance(h.db,h.beta.id),100000000);
  const approved=await h.guardian(paymentId,'approve',{reason:'approved within funded treasury policy'});
  assert.equal(approved.status,200);assert.equal(approved.body.payment.status,'CONFIRMED');assert.equal(approved.body.creditCreated,false);assert.equal(approved.body.payment.policy.requiresGuardianApproval,true);
  assert.equal(balance(h.db,h.alpha.id),40000000);assert.equal(balance(h.db,h.beta.id),160000000);
  assert.equal(h.db.prepare('SELECT COUNT(*) AS n FROM agent_financial_transactions WHERE payment_intent_id=?').get(paymentId).n,1);
  assert.equal(h.db.prepare("SELECT COUNT(*) AS n FROM wallet_audit_log WHERE action='GUARDIAN_PAYMENT_APPROVED' AND related_id=?").get(paymentId).n,1);
  const retry=await h.guardian(paymentId,'approve');assert.equal(retry.status,200);assert.equal(retry.body.idempotentReplay,true);assert.equal(balance(h.db,h.alpha.id),40000000);
});

test('Guardian approval cannot manufacture credit after funded balance changes',async t=>{
  const h=await setup(t);const paymentId=await pending60(h,'guardian-insufficient-1');
  h.db.prepare("UPDATE wallet_balances SET available_atomic=50000000 WHERE wallet_id=? AND asset='USDC'").run(h.alphaWallet.id);
  const result=await h.guardian(paymentId,'approve');
  assert.equal(result.status,422);assert.equal(result.body.error.code,'INSUFFICIENT_BALANCE');
  assert.equal(h.db.prepare('SELECT status FROM agent_payment_intents WHERE id=?').get(paymentId).status,'APPROVAL_REQUIRED');assert.equal(balance(h.db,h.alpha.id),50000000);assert.equal(balance(h.db,h.beta.id),100000000);
});

test('freezing sender before Guardian approval prevents settlement',async t=>{
  const h=await setup(t);const paymentId=await pending60(h,'guardian-frozen-1');
  const frozen=await h.freeze(h.alphaWallet.id);assert.equal(frozen.status,200);
  const result=await h.guardian(paymentId,'approve');assert.equal(result.status,422);assert.equal(result.body.error.code,'WALLET_NOT_ACTIVE');
  assert.equal(h.db.prepare('SELECT status FROM agent_payment_intents WHERE id=?').get(paymentId).status,'APPROVAL_REQUIRED');assert.equal(balance(h.db,h.alpha.id),100000000);assert.equal(balance(h.db,h.beta.id),100000000);
});

test('Guardian denial blocks pending payment without moving funded balance',async t=>{
  const h=await setup(t);const paymentId=await pending60(h,'guardian-deny-1');
  const denied=await h.guardian(paymentId,'deny',{reason:'task evidence not approved'});assert.equal(denied.status,200);assert.equal(denied.body.payment.status,'BLOCKED');assert.equal(denied.body.payment.policy.code,'GUARDIAN_DENIED');
  assert.equal(balance(h.db,h.alpha.id),100000000);assert.equal(balance(h.db,h.beta.id),100000000);assert.equal(h.db.prepare('SELECT COUNT(*) AS n FROM agent_financial_transactions WHERE payment_intent_id=?').get(paymentId).n,0);
  const retry=await h.guardian(paymentId,'deny');assert.equal(retry.status,200);assert.equal(retry.body.idempotentReplay,true);
});

test('Guardian endpoints require authorization and bounded JSON bodies',async t=>{
  const h=await setup(t);const paymentId=await pending60(h,'guardian-auth-1');
  const unauthorized=await h.guardian(paymentId,'approve',{token:'wrong'});assert.equal(unauthorized.status,401);assert.equal(unauthorized.body.error.code,'GUARDIAN_UNAUTHORIZED');
  const oversized=await h.guardian(paymentId,'deny',{rawBody:JSON.stringify({reason:'x'.repeat(17000)})});assert.equal(oversized.status,413);assert.equal(oversized.body.error.code,'REQUEST_BODY_TOO_LARGE');
  assert.equal(h.db.prepare('SELECT status FROM agent_payment_intents WHERE id=?').get(paymentId).status,'APPROVAL_REQUIRED');
});

test('Guardian schema and runtime introduce no loan, debt or credit storage',async t=>{
  const h=await setup(t);
  assert.equal(h.db.prepare("SELECT COUNT(*) AS n FROM sqlite_master WHERE type='table' AND (lower(name) LIKE '%loan%' OR lower(name) LIKE '%debt%' OR lower(name) LIKE '%credit%')").get().n,0);
  const source=fs.readFileSync(new URL('../src/wallet-guardian.js',import.meta.url),'utf8');
  assert.match(source,/Guardian approval cannot create funds/);assert.doesNotMatch(source,/interest_rate|borrow_limit|credit_line|loan_principal/);
});
