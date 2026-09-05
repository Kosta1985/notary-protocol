import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {DatabaseSync} from 'node:sqlite';
import {handleAgentWallet,agentWalletErrorResponse} from '../src/agent-wallet.js';
import {walletCapabilities} from '../src/wallet-capabilities.js';
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
  for(const file of ['0001_receipts.sql','0005_agent_security.sql','0022_agent_wallet_treasury.sql','0023_agent_wallet_rate_limits.sql','0024_agent_wallet_settlement_guards.sql'])db.exec(fs.readFileSync(new URL(`../migrations/${file}`,import.meta.url),'utf8'));
  const alpha={id:'ACCORD-AGENT-ALPHA',pair:await keypair()};
  const beta={id:'ACCORD-AGENT-BETA',pair:await keypair()};
  const now=new Date().toISOString();
  for(const agent of [alpha,beta])db.prepare('INSERT INTO agent_passports(id,public_key,last_signed_at,created_at,updated_at) VALUES(?,?,?,?,?)').run(agent.id,await publicPem(agent.pair.publicKey),now,now,now);
  const env={
    DB:d1(db),WALLET_MODE:'testnet',WALLET_PROVIDER:'accord_test',WALLET_NETWORK:'accord:testnet',WALLET_CHAIN_ID:'0',TEST_WALLET_INITIAL_USDC_ATOMIC:'10000000',
    FEATURE_AGENT_WALLETS:'true',FEATURE_AGENT_PAYMENTS:'true',FEATURE_AGENT_TREASURY:'true',FEATURE_ECONOMIC_TRUST:'true',FEATURE_GUARDIAN_CONTROLS:'true',WALLET_OPERATOR_TOKEN:'operator-test-only'
  };
  let nonce=0;
  async function invoke(agent,path,{method='GET',body,idempotencyKey}={}){
    const request=await createSignedAgentRequest({baseUrl:ORIGIN,passportId:agent.id,privateKey:agent.pair.privateKey,path,method,body,idempotencyKey,nonce:`nonce_${agent.id}_${++nonce}`});
    try{const response=await handleAgentWallet(request,env,new URL(request.url));return{status:response.status,body:await response.json()};}
    catch(error){const response=agentWalletErrorResponse(error);return{status:response.status,body:await response.json()};}
  }
  async function admin(walletId,action){const request=new Request(`${ORIGIN}/api/v1/wallet-admin/wallets/${walletId}/${action}`,{method:'POST',headers:{authorization:'Bearer operator-test-only','content-type':'application/json'},body:JSON.stringify({reason:'integration-test'})});try{const response=await handleAgentWallet(request,env,new URL(request.url));return{status:response.status,body:await response.json()};}catch(error){const response=agentWalletErrorResponse(error);return{status:response.status,body:await response.json()};}}
  return{db,env,alpha,beta,invoke,admin};
}

function balance(db,agentId){return db.prepare(`SELECT b.available_atomic AS amount FROM wallet_balances b JOIN agent_wallets w ON w.id=b.wallet_id WHERE w.passport_id=? AND b.asset='USDC'`).get(agentId).amount;}

test('machine capability contract is agent-first, funded-only and no-credit',async t=>{
  const h=await setup(t);const c=walletCapabilities(h.env);
  assert.equal(c.audience,'autonomous_agents');assert.equal(c.machine_first,true);assert.equal(c.wallet_enabled,true);assert.equal(c.payments_enabled,true);
  assert.equal(c.authentication.algorithm,'Ed25519');assert.equal(c.authentication.nonce_replay_protection,true);assert.equal(c.payment_contract.idempotency_key_required,true);
  assert.equal(c.payment_contract.funded_balance_only,true);assert.equal(c.payment_contract.negative_balances,false);assert.equal(c.credit_and_lending.enabled,false);assert.equal(c.credit_and_lending.loans,false);assert.equal(c.credit_and_lending.overdrafts,false);
});

test('Alpha pays Beta from funded balance, policy blocks 1000 USDC, Guardian freeze stops the next payment',async t=>{
  const h=await setup(t);
  const alphaWallet=await h.invoke(h.alpha,'/api/v1/agent/wallet',{method:'POST',body:{}});const betaWallet=await h.invoke(h.beta,'/api/v1/agent/wallet',{method:'POST',body:{}});
  assert.equal(alphaWallet.status,201);assert.equal(betaWallet.status,201);assert.notEqual(alphaWallet.body.wallet.walletAddress,betaWallet.body.wallet.walletAddress);
  assert.equal(balance(h.db,h.alpha.id),10000000);assert.equal(balance(h.db,h.beta.id),10000000);

  const paymentBody={recipientAgentId:h.beta.id,amount:'1',asset:'USDC',purpose:'AGENT_TASK_SETTLEMENT',taskId:'task_alpha_beta_1'};
  const paid=await h.invoke(h.alpha,'/api/v1/agent/payments',{method:'POST',body:paymentBody,idempotencyKey:'alpha-beta-0001'});
  assert.equal(paid.status,201);assert.equal(paid.body.payment.status,'CONFIRMED');assert.equal(paid.body.payment.amount,'1');assert.equal(paid.body.receipt.status,'CONFIRMED');
  assert.equal(balance(h.db,h.alpha.id),9000000);assert.equal(balance(h.db,h.beta.id),11000000);

  const replay=await h.invoke(h.alpha,'/api/v1/agent/payments',{method:'POST',body:paymentBody,idempotencyKey:'alpha-beta-0001'});
  assert.equal(replay.status,200);assert.equal(replay.body.idempotentReplay,true);assert.equal(balance(h.db,h.alpha.id),9000000);assert.equal(balance(h.db,h.beta.id),11000000);

  const denied=await h.invoke(h.alpha,'/api/v1/agent/payments',{method:'POST',body:{...paymentBody,amount:'1000',taskId:'task_alpha_beta_limit'},idempotencyKey:'alpha-beta-limit-1'});
  assert.equal(denied.status,422);assert.equal(denied.body.payment.status,'BLOCKED');assert.equal(denied.body.payment.policy.code,'TRANSACTION_LIMIT_EXCEEDED');assert.equal(balance(h.db,h.alpha.id),9000000);assert.equal(balance(h.db,h.beta.id),11000000);

  const frozen=await h.admin(alphaWallet.body.wallet.id,'freeze');assert.equal(frozen.status,200);assert.equal(frozen.body.wallet.status,'FROZEN');
  const afterFreeze=await h.invoke(h.alpha,'/api/v1/agent/payments',{method:'POST',body:{...paymentBody,taskId:'task_after_freeze'},idempotencyKey:'alpha-beta-frozen-1'});
  assert.equal(afterFreeze.status,422);assert.equal(afterFreeze.body.error.code,'WALLET_NOT_ACTIVE');assert.equal(balance(h.db,h.alpha.id),9000000);assert.equal(balance(h.db,h.beta.id),11000000);

  assert.equal(h.db.prepare("SELECT COUNT(*) AS n FROM agent_financial_transactions WHERE state='CONFIRMED'").get().n,1);
  assert.equal(h.db.prepare("SELECT COUNT(*) AS n FROM receipts WHERE deal_id='accordtrace-financial-v1'").get().n,5);
  assert.equal(h.db.prepare("SELECT COUNT(*) AS n FROM sqlite_master WHERE type='table' AND (lower(name) LIKE '%loan%' OR lower(name) LIKE '%debt%' OR lower(name) LIKE '%credit%')").get().n,0);
});
