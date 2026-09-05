import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createSignedAgentRequest,importAgentPrivateJwk} from '../examples/agent-wallet/signed-client.mjs';

const command=process.argv[2];
if(command==='prepare')await prepare(process.argv[3],process.argv[4]);
else if(command==='run')await run(process.argv[3],process.argv[4]);
else throw new Error('Usage: node scripts/agent-wallet-isolated-e2e.mjs prepare <keys.json> <seed.sql> | run <baseUrl> <keys.json>');

async function prepare(keysPath,seedPath){
  if(!keysPath||!seedPath)throw new Error('prepare requires key and seed paths');
  const agents=[];
  for(const id of ['ACCORD-AGENT-ALPHA','ACCORD-AGENT-BETA']){
    const pair=await crypto.subtle.generateKey({name:'Ed25519'},true,['sign','verify']);
    agents.push({id,privateJwk:await crypto.subtle.exportKey('jwk',pair.privateKey),publicPem:await publicPem(pair.publicKey)});
  }
  fs.writeFileSync(keysPath,JSON.stringify({agents:agents.map(({id,privateJwk})=>({id,privateJwk}))}),{mode:0o600});
  const now=new Date().toISOString();
  const sql=agents.map(({id,publicPem})=>`INSERT INTO agent_passports(id,public_key,last_signed_at,created_at,updated_at) VALUES('${escapeSql(id)}','${escapeSql(publicPem)}','${now}','${now}','${now}');`).join('\n');
  fs.writeFileSync(seedPath,sql,{mode:0o600});
  console.log(JSON.stringify({prepared:true,agent_ids:agents.map(x=>x.id),private_keys_logged:false}));
}

async function run(baseUrl,keysPath){
  if(!baseUrl||!keysPath)throw new Error('run requires base URL and key path');
  const base=new URL(baseUrl);
  if(base.protocol!=='https:')throw new Error('isolated wallet base must use HTTPS');
  const operatorToken=String(process.env.WALLET_E2E_OPERATOR_TOKEN||'');
  if(operatorToken.length<24)throw new Error('WALLET_E2E_OPERATOR_TOKEN is missing or too short');
  const stored=JSON.parse(fs.readFileSync(keysPath,'utf8'));
  const byId=new Map();
  for(const entry of stored.agents||[])byId.set(entry.id,{id:entry.id,privateKey:await importAgentPrivateJwk(entry.privateJwk)});
  const alpha=byId.get('ACCORD-AGENT-ALPHA'),beta=byId.get('ACCORD-AGENT-BETA');
  assert.ok(alpha&&beta,'Both test agents are required');

  const report={status:'running',base_url:base.origin,agents:[alpha.id,beta.id],checks:[],real_funds:false,credit_or_lending:false};
  const check=(name,fn)=>Promise.resolve().then(fn).then(()=>report.checks.push({name,ok:true}),error=>{report.checks.push({name,ok:false,error:error.message});throw error});

  const capabilities=await get('/api/v1/agent/wallet-capabilities');
  await check('machine capability contract',async()=>{
    assert.equal(capabilities.audience,'autonomous_agents');
    assert.equal(capabilities.machine_first,true);
    assert.equal(capabilities.wallet_enabled,true);
    assert.equal(capabilities.payments_enabled,true);
    assert.equal(capabilities.payment_contract?.funded_balance_only,true);
    assert.equal(capabilities.payment_contract?.negative_balances,false);
    assert.equal(capabilities.payment_contract?.guardian_approval_creates_funds,false);
    assert.equal(capabilities.credit_and_lending?.enabled,false);
    assert.equal(capabilities.machine_protocols?.mutations_require_direct_passport_signed_request,true);
  });

  const alphaWallet=(await signed(alpha,'/api/v1/agent/wallet',{method:'POST',body:{}})).wallet;
  const betaWallet=(await signed(beta,'/api/v1/agent/wallet',{method:'POST',body:{}})).wallet;
  await check('separate agent wallet identities',async()=>{
    assert.ok(alphaWallet?.id&&betaWallet?.id);
    assert.notEqual(alphaWallet.id,betaWallet.id);
    assert.notEqual(alphaWallet.walletAddress,betaWallet.walletAddress);
    assert.equal(alphaWallet.status,'ACTIVE');assert.equal(betaWallet.status,'ACTIVE');
  });
  await check('initial funded balances',async()=>{
    assert.equal(await available(alpha),'100');assert.equal(await available(beta),'100');
  });

  const paymentBody={recipientAgentId:beta.id,amount:'1',asset:'USDC',purpose:'AGENT_TASK_SETTLEMENT',taskId:'e2e-alpha-beta-1'};
  const paid=await signed(alpha,'/api/v1/agent/payments',{method:'POST',body:paymentBody,idempotencyKey:'e2e-alpha-beta-0001'});
  await check('Alpha pays Beta from funded balance',async()=>{
    assert.equal(paid.payment?.status,'CONFIRMED');assert.equal(paid.payment?.amount,'1');assert.ok(paid.receipt?.receiptId);
    assert.equal(await available(alpha),'99');assert.equal(await available(beta),'101');
  });

  const replay=await signed(alpha,'/api/v1/agent/payments',{method:'POST',body:paymentBody,idempotencyKey:'e2e-alpha-beta-0001'});
  await check('economic idempotency survives fresh signed nonce',async()=>{
    assert.equal(replay.idempotentReplay,true);assert.equal(await available(alpha),'99');assert.equal(await available(beta),'101');
  });

  const limit=await signed(alpha,'/api/v1/agent/payments',{method:'POST',body:{...paymentBody,amount:'1000',taskId:'e2e-limit'},idempotencyKey:'e2e-hard-limit-0001'},[422]);
  await check('hard policy limit blocks oversized payment',async()=>{
    assert.equal(limit.payment?.status,'BLOCKED');assert.equal(limit.payment?.policy?.code,'TRANSACTION_LIMIT_EXCEEDED');assert.equal(await available(alpha),'99');
  });

  const pending=await signed(alpha,'/api/v1/agent/payments',{method:'POST',body:{...paymentBody,amount:'60',taskId:'e2e-guardian-approve'},idempotencyKey:'e2e-guardian-approve-1'},[202]);
  await check('high-value funded payment waits for Guardian',async()=>{assert.equal(pending.payment?.status,'APPROVAL_REQUIRED');assert.ok(pending.payment?.id)});
  const approved=await admin(`/api/v1/wallet-admin/payments/${encodeURIComponent(pending.payment.id)}/approve`,{reason:'isolated e2e funded approval'});
  await check('Guardian approval rechecks and settles funded balance',async()=>{
    assert.equal(approved.payment?.status,'CONFIRMED');assert.equal(approved.creditCreated,false);assert.equal(await available(alpha),'39');assert.equal(await available(beta),'161');
  });
  const approvalReplay=await admin(`/api/v1/wallet-admin/payments/${encodeURIComponent(pending.payment.id)}/approve`,{reason:'isolated e2e retry'});
  await check('Guardian approval is idempotent',async()=>{assert.equal(approvalReplay.idempotentReplay,true);assert.equal(await available(alpha),'39')});

  const pendingDeny=await signed(alpha,'/api/v1/agent/payments',{method:'POST',body:{...paymentBody,amount:'60',taskId:'e2e-guardian-deny'},idempotencyKey:'e2e-guardian-deny-01'},[202]);
  const denied=await admin(`/api/v1/wallet-admin/payments/${encodeURIComponent(pendingDeny.payment.id)}/deny`,{reason:'isolated e2e deny'});
  await check('Guardian denial moves no funds',async()=>{assert.equal(denied.payment?.status,'BLOCKED');assert.equal(await available(alpha),'39');assert.equal(await available(beta),'161')});

  const frozen=await admin(`/api/v1/wallet-admin/wallets/${encodeURIComponent(alphaWallet.id)}/freeze`,{reason:'isolated e2e security freeze'});
  await check('Guardian can freeze autonomous wallet',async()=>{assert.equal(frozen.wallet?.status,'FROZEN')});
  const blockedAfterFreeze=await signed(alpha,'/api/v1/agent/payments',{method:'POST',body:{...paymentBody,taskId:'e2e-after-freeze'},idempotencyKey:'e2e-after-freeze-1'},[422]);
  await check('frozen agent cannot settle',async()=>{assert.equal(blockedAfterFreeze.error?.code,'WALLET_NOT_ACTIVE');assert.equal(await available(alpha),'39');assert.equal(await available(beta),'161')});

  const trust=await signed(alpha,'/api/v1/agent/economic-trust');
  await check('economic history stays operational, not credit',async()=>{
    assert.equal(trust.walletStatus,'FROZEN');assert.match((trust.limitations||[]).join(' '),/not a credit score/i);
  });
  const receipts=await signed(alpha,'/api/v1/agent/receipts?limit=100');
  await check('agent can reconcile financial receipts',async()=>{assert.ok(Array.isArray(receipts.receipts));assert.ok(receipts.receipts.length>=3)});

  report.status='passed';
  report.final_balances={alpha_usdc:await available(alpha),beta_usdc:await available(beta)};
  report.confirmed_real_funds=false;
  report.confirmed_credit_or_lending=false;
  console.log(JSON.stringify(report,null,2));

  async function available(agent){const body=await signed(agent,'/api/v1/agent/wallet/balance');const row=(body.balances||[]).find(x=>x.asset==='USDC');assert.ok(row);return row.available;}
  async function signed(agent,path,{method='GET',body,idempotencyKey}={},expected=[200,201]){
    const request=await createSignedAgentRequest({baseUrl:base.origin,passportId:agent.id,privateKey:agent.privateKey,path,method,body,idempotencyKey});
    const response=await fetch(request,{redirect:'error',signal:AbortSignal.timeout(15000)});const payload=await response.json();
    if(!expected.includes(response.status))throw new Error(`${method} ${path}: HTTP ${response.status} ${safeError(payload)}`);return payload;
  }
  async function admin(path,body,expected=[200]){const response=await fetch(new URL(path,base),{method:'POST',headers:{authorization:`Bearer ${operatorToken}`,'content-type':'application/json'},body:JSON.stringify(body),redirect:'error',signal:AbortSignal.timeout(15000)});const payload=await response.json();if(!expected.includes(response.status))throw new Error(`POST ${path}: HTTP ${response.status} ${safeError(payload)}`);return payload;}
  async function get(path){const response=await fetch(new URL(path,base),{headers:{accept:'application/json'},redirect:'error',signal:AbortSignal.timeout(15000)});const payload=await response.json();if(!response.ok)throw new Error(`GET ${path}: HTTP ${response.status} ${safeError(payload)}`);return payload;}
}

async function publicPem(publicKey){const bytes=new Uint8Array(await crypto.subtle.exportKey('spki',publicKey));const b64=Buffer.from(bytes).toString('base64');return`-----BEGIN PUBLIC KEY-----\n${b64.match(/.{1,64}/g).join('\n')}\n-----END PUBLIC KEY-----`;}
function escapeSql(value){return String(value).replaceAll("'","''");}
function safeError(payload){return JSON.stringify(payload?.error||payload||{}).slice(0,300);}
