import {createWalletProvider} from './wallet/providers/accord-test.js';
import {atomicFromDb,toDbInteger,formatAssetAmount} from './wallet/money.js';
import {policyFromRow,evaluateTransactionPolicy,POLICY_DECISIONS} from './wallet/policy.js';
import {buildWalletReceipt,receiptInsert} from './wallet-receipts.js';
import {canonicalize,sha256Hex} from './wallet-auth.js';

const JSON_HEADERS={'content-type':'application/json; charset=utf-8','cache-control':'no-store'};
const MAX_ADMIN_BODY_BYTES=16*1024;
const TRUE=/^(1|true|yes|on)$/i;

export class WalletGuardianError extends Error{
  constructor(code,status=400,message=code,details=null){super(message);this.code=code;this.status=status;this.details=details;}
}

export async function handleWalletGuardian(request,env,url=new URL(request.url)){
  const match=url.pathname.match(/^\/api\/v1\/wallet-admin\/payments\/(pi_[a-f0-9]{32})\/(approve|deny)$/);
  if(!match)return null;
  if(request.method!=='POST')return json({error:{code:'METHOD_NOT_ALLOWED',message:'POST is required.'}},405,{'allow':'POST'});
  requireFeature(env,'FEATURE_GUARDIAN_CONTROLS');
  await requireOperator(request,env);
  const body=await readBoundedJson(request);
  const reason=cleanReason(body.reason,match[2]==='approve'?'Guardian approved funded settlement.':'Guardian denied settlement.');
  return match[2]==='approve'?approvePayment(env,match[1],reason):denyPayment(env,match[1],reason);
}

async function approvePayment(env,paymentId,reason){
  const payment=await paymentById(env,paymentId);
  if(!payment)throw new WalletGuardianError('PAYMENT_NOT_FOUND',404,'Payment intent was not found.');
  if(payment.status==='CONFIRMED'&&Number(payment.requires_guardian_approval)===1&&payment.approved_at){
    return json({payment:paymentView(payment),idempotentReplay:true,creditCreated:false},200);
  }
  if(payment.status!=='APPROVAL_REQUIRED')throw new WalletGuardianError('PAYMENT_NOT_AWAITING_APPROVAL',409,`Payment status ${payment.status} cannot be Guardian-approved.`);

  const sender=await walletById(env,payment.sender_wallet_id);
  const recipient=await walletById(env,payment.recipient_wallet_id);
  if(!sender||sender.status!=='ACTIVE')throw new WalletGuardianError('WALLET_NOT_ACTIVE',422,'Sender wallet must be active at approval time.');
  if(!recipient||recipient.status!=='ACTIVE')throw new WalletGuardianError('RECIPIENT_WALLET_NOT_ACTIVE',422,'Recipient wallet must be active at approval time.');

  const policyRow=await env.DB.prepare('SELECT * FROM wallet_policies WHERE id=?1').bind(sender.policy_id).first();
  if(!policyRow)throw new WalletGuardianError('WALLET_POLICY_NOT_FOUND',422,'Current wallet policy was not found.');
  const policy=policyFromRow(policyRow);
  const since=new Date(Date.now()-24*60*60*1000).toISOString();
  const spentRow=await env.DB.prepare(`SELECT COALESCE(SUM(amount_atomic),0) AS spent FROM agent_payment_intents WHERE sender_passport_id=?1 AND status='CONFIRMED' AND created_at>=?2`).bind(payment.sender_passport_id,since).first();
  const amount=atomicFromDb(payment.amount_atomic);
  const decision=evaluateTransactionPolicy({
    wallet:sender,
    policy,
    transaction:{amountAtomic:amount,asset:payment.asset,taskId:payment.task_id||null},
    spentLast24hAtomic:atomicFromDb(spentRow?.spent||0),
    recipientWallet:recipient
  });
  if(decision.decision===POLICY_DECISIONS.DENY||decision.decision===POLICY_DECISIONS.QUARANTINE){
    throw new WalletGuardianError('GUARDIAN_APPROVAL_POLICY_DENIED',422,'Current policy no longer permits this payment.',{policyCode:decision.code});
  }

  const balance=await env.DB.prepare('SELECT available_atomic FROM wallet_balances WHERE wallet_id=?1 AND asset=?2').bind(sender.id,payment.asset).first();
  if(!balance||atomicFromDb(balance.available_atomic)<amount)throw new WalletGuardianError('INSUFFICIENT_BALANCE',422,'Guardian approval cannot create funds; available funded balance is insufficient.');

  const provider=createWalletProvider(env);
  if(provider.settlementMode!=='simulated')throw new WalletGuardianError('ONCHAIN_EXECUTION_NOT_ENABLED',503,'Guardian execution is enabled only for the explicit safe test provider in this milestone.');
  const prepared=await provider.prepareTransaction({paymentIntentId:payment.id,senderWallet:sender,recipientWallet:recipient,amountAtomic:amount,asset:payment.asset});
  const now=new Date().toISOString();
  const txId=id('ft');
  const receipt=await buildWalletReceipt({
    receiptType:'FINANCIAL_TRANSACTION',agentId:payment.sender_passport_id,wallet:sender.wallet_address,
    action:'PAYMENT',recipientAgentId:payment.recipient_passport_id,amountAtomic:amount,asset:payment.asset,
    purpose:payment.purpose,taskId:payment.task_id||null,policyDecision:decision.decision,policyCode:'GUARDIAN_APPROVED',
    guardianApproval:true,provider:prepared.provider,network:prepared.network,settlementMode:prepared.settlementMode,
    transactionRef:prepared.providerTxRef,status:'CONFIRMED',reason,timestamp:now
  });
  const auditHash=await sha256Hex(canonicalize({action:'GUARDIAN_PAYMENT_APPROVED',paymentId:payment.id,walletId:sender.id,amountAtomic:amount.toString(),asset:payment.asset,reason,timestamp:now}));
  let results;
  try{
    results=await env.DB.batch([
      env.DB.prepare(`UPDATE agent_payment_intents SET status='CONFIRMED',policy_decision=?1,policy_code='GUARDIAN_APPROVED',policy_reason=?2,approved_at=?3,submitted_at=?3,confirmed_at=?3,receipt_id=?4,updated_at=?3 WHERE id=?5 AND status='APPROVAL_REQUIRED'`).bind(decision.decision,reason,now,receipt.receiptId,payment.id),
      env.DB.prepare(`UPDATE wallet_balances SET available_atomic=available_atomic-?1,updated_at=?2 WHERE wallet_id=?3 AND asset=?4 AND available_atomic>=?1`).bind(toDbInteger(amount),now,sender.id,payment.asset),
      env.DB.prepare(`INSERT INTO wallet_balances(wallet_id,asset,available_atomic,reserved_atomic,updated_at) VALUES(?1,?2,?3,0,?4) ON CONFLICT(wallet_id,asset) DO UPDATE SET available_atomic=available_atomic+excluded.available_atomic,updated_at=excluded.updated_at`).bind(recipient.id,payment.asset,toDbInteger(amount),now),
      env.DB.prepare(`INSERT INTO agent_financial_transactions(id,payment_intent_id,provider,network,provider_tx_ref,blockchain_tx_hash,settlement_mode,state,amount_atomic,asset,submitted_at,confirmed_at,created_at,updated_at) VALUES(?1,?2,?3,?4,?5,NULL,?6,'CONFIRMED',?7,?8,?9,?9,?9,?9)`).bind(txId,payment.id,prepared.provider,prepared.network,prepared.providerTxRef,prepared.settlementMode,toDbInteger(amount),payment.asset,now),
      receiptInsert(env,receipt),
      eventInsert(env,payment.sender_passport_id,sender.id,'GUARDIAN_APPROVAL',amount,payment.asset,payment.id,{approved:true,creditCreated:false},now),
      eventInsert(env,payment.sender_passport_id,sender.id,'PAYMENT_SENT',amount,payment.asset,payment.id,{recipientPassportId:payment.recipient_passport_id,guardianApproval:true},now),
      eventInsert(env,payment.recipient_passport_id,recipient.id,'PAYMENT_RECEIVED',amount,payment.asset,payment.id,{senderPassportId:payment.sender_passport_id,guardianApproval:true},now),
      eventInsert(env,payment.sender_passport_id,sender.id,'SETTLEMENT_CONFIRMED',amount,payment.asset,txId,{providerTxRef:prepared.providerTxRef,guardianApproval:true},now),
      env.DB.prepare(`INSERT INTO wallet_audit_log(id,passport_id,wallet_id,action,actor_type,actor_ref,reason,previous_state_json,new_state_json,related_id,payload_hash,created_at) VALUES(?1,?2,?3,'GUARDIAN_PAYMENT_APPROVED','GUARDIAN','accord_operator',?4,?5,?6,?7,?8,?9)`).bind(id('wa'),payment.sender_passport_id,sender.id,reason,JSON.stringify({status:'APPROVAL_REQUIRED'}),JSON.stringify({status:'CONFIRMED',creditCreated:false}),payment.id,auditHash,now)
    ]);
  }catch(error){throw mapSettlementError(error);}
  if(Number(results?.[0]?.meta?.changes??0)!==1||Number(results?.[1]?.meta?.changes??0)!==1)throw new WalletGuardianError('GUARDIAN_APPROVAL_STATE_CONFLICT',409,'Payment or funded balance changed during approval; no credit fallback is permitted.');
  const updated=await paymentById(env,payment.id);
  return json({payment:paymentView(updated),transaction:{id:txId,providerTxRef:prepared.providerTxRef,amount:formatAssetAmount(amount,payment.asset),asset:payment.asset},receipt,creditCreated:false},200);
}

async function denyPayment(env,paymentId,reason){
  const payment=await paymentById(env,paymentId);
  if(!payment)throw new WalletGuardianError('PAYMENT_NOT_FOUND',404,'Payment intent was not found.');
  if(payment.status==='BLOCKED'&&payment.policy_code==='GUARDIAN_DENIED')return json({payment:paymentView(payment),idempotentReplay:true},200);
  if(payment.status!=='APPROVAL_REQUIRED')throw new WalletGuardianError('PAYMENT_NOT_AWAITING_APPROVAL',409,`Payment status ${payment.status} cannot be Guardian-denied.`);
  const sender=await walletById(env,payment.sender_wallet_id);
  if(!sender)throw new WalletGuardianError('WALLET_NOT_FOUND',404,'Sender wallet was not found.');
  const amount=atomicFromDb(payment.amount_atomic);
  const now=new Date().toISOString();
  const receipt=await buildWalletReceipt({
    receiptType:'FINANCIAL_TRANSACTION',agentId:payment.sender_passport_id,wallet:sender.wallet_address,
    action:'PAYMENT',recipientAgentId:payment.recipient_passport_id,amountAtomic:amount,asset:payment.asset,
    purpose:payment.purpose,taskId:payment.task_id||null,policyDecision:'DENY',policyCode:'GUARDIAN_DENIED',
    guardianApproval:false,provider:sender.provider,network:sender.network,settlementMode:sender.settlement_mode,status:'BLOCKED',reason,timestamp:now
  });
  const auditHash=await sha256Hex(canonicalize({action:'GUARDIAN_PAYMENT_DENIED',paymentId:payment.id,walletId:sender.id,reason,timestamp:now}));
  let results;
  try{
    results=await env.DB.batch([
      env.DB.prepare(`UPDATE agent_payment_intents SET status='BLOCKED',policy_decision='DENY',policy_code='GUARDIAN_DENIED',policy_reason=?1,receipt_id=?2,failed_at=?3,updated_at=?3 WHERE id=?4 AND status='APPROVAL_REQUIRED'`).bind(reason,receipt.receiptId,now,payment.id),
      env.DB.prepare(`INSERT INTO wallet_audit_log(id,passport_id,wallet_id,action,actor_type,actor_ref,reason,previous_state_json,new_state_json,related_id,payload_hash,created_at) VALUES(?1,?2,?3,'GUARDIAN_PAYMENT_DENIED','GUARDIAN','accord_operator',?4,?5,?6,?7,?8,?9)`).bind(id('wa'),payment.sender_passport_id,sender.id,reason,JSON.stringify({status:'APPROVAL_REQUIRED'}),JSON.stringify({status:'BLOCKED'}),payment.id,auditHash,now),
      receiptInsert(env,receipt),
      eventInsert(env,payment.sender_passport_id,sender.id,'GUARDIAN_DENIAL',amount,payment.asset,payment.id,{reason},now)
    ]);
  }catch(error){throw mapSettlementError(error);}
  if(Number(results?.[0]?.meta?.changes??0)!==1)throw new WalletGuardianError('GUARDIAN_DENIAL_STATE_CONFLICT',409,'Payment state changed during denial.');
  return json({payment:paymentView(await paymentById(env,payment.id)),receipt},200);
}

export function walletGuardianErrorResponse(error){
  if(error instanceof WalletGuardianError)return json({error:{code:error.code,message:error.message,...(error.details?{details:error.details}:{})}},error.status);
  return json({error:{code:'WALLET_GUARDIAN_INTERNAL_ERROR',message:'Guardian operation failed safely.'}},500);
}

async function paymentById(env,id){return env.DB.prepare('SELECT * FROM agent_payment_intents WHERE id=?1').bind(id).first();}
async function walletById(env,id){return env.DB.prepare('SELECT * FROM agent_wallets WHERE id=?1').bind(id).first();}
function eventInsert(env,passportId,walletId,type,amount,asset,relatedId,metadata,now){return env.DB.prepare(`INSERT INTO agent_economic_events(id,passport_id,wallet_id,event_type,amount_atomic,asset,related_id,metadata_json,created_at) VALUES(?1,?2,?3,?4,?5,?6,?7,?8,?9)`).bind(id('ee'),passportId,walletId,type,toDbInteger(amount),asset,relatedId,JSON.stringify(metadata||{}),now);}
function paymentView(row){return{id:row.id,status:row.status,senderAgentId:row.sender_passport_id,recipientAgentId:row.recipient_passport_id,amount:formatAssetAmount(row.amount_atomic,row.asset),asset:row.asset,purpose:row.purpose,taskId:row.task_id||null,policy:{decision:row.policy_decision,code:row.policy_code,reason:row.policy_reason,requiresGuardianApproval:Boolean(row.requires_guardian_approval)},receiptId:row.receipt_id||null,approvedAt:row.approved_at||null,confirmedAt:row.confirmed_at||null,updatedAt:row.updated_at};}
function requireFeature(env,name){if(!TRUE.test(String(env?.[name]||'false')))throw new WalletGuardianError('FEATURE_DISABLED',404,`${name} is disabled.`);}
async function requireOperator(request,env){
  const expected=String(env.WALLET_OPERATOR_TOKEN||'');
  if(!expected)throw new WalletGuardianError('GUARDIAN_NOT_CONFIGURED',503,'Guardian operator authorization is not configured.');
  const auth=String(request.headers.get('authorization')||'');
  const supplied=auth.startsWith('Bearer ')?auth.slice(7):'';
  if(!supplied||!await secureEqual(supplied,expected))throw new WalletGuardianError('GUARDIAN_UNAUTHORIZED',401,'Guardian operator authorization is required.');
}
async function secureEqual(a,b){const [ad,bd]=await Promise.all([crypto.subtle.digest('SHA-256',new TextEncoder().encode(a)),crypto.subtle.digest('SHA-256',new TextEncoder().encode(b))]);const x=new Uint8Array(ad),y=new Uint8Array(bd);let diff=0;for(let i=0;i<x.length;i++)diff|=x[i]^y[i];return diff===0;}
async function readBoundedJson(request){const text=await request.text();if(new TextEncoder().encode(text).byteLength>MAX_ADMIN_BODY_BYTES)throw new WalletGuardianError('REQUEST_BODY_TOO_LARGE',413,'Guardian request body exceeds 16 KiB.');if(!text)return{};let body;try{body=JSON.parse(text);}catch{throw new WalletGuardianError('REQUEST_BODY_MUST_BE_JSON',400,'Guardian request body must be JSON.');}if(!body||typeof body!=='object'||Array.isArray(body))throw new WalletGuardianError('REQUEST_BODY_MUST_BE_OBJECT',400,'Guardian request body must be a JSON object.');return body;}
function cleanReason(value,fallback){const text=String(value??fallback).trim();if(!text)return fallback;if(text.length>500)throw new WalletGuardianError('REASON_TOO_LONG',400,'Guardian reason must be 500 characters or fewer.');return text;}
function mapSettlementError(error){const message=String(error?.message||'');if(message.includes('sender_wallet_not_active'))return new WalletGuardianError('WALLET_NOT_ACTIVE',422,'Sender wallet became inactive before settlement.');if(message.includes('recipient_wallet_not_active'))return new WalletGuardianError('RECIPIENT_WALLET_NOT_ACTIVE',422,'Recipient wallet became inactive before settlement.');if(message.includes('insufficient_wallet_balance'))return new WalletGuardianError('INSUFFICIENT_BALANCE',422,'Guardian approval cannot create funds; funded balance changed before settlement.');if(message.includes('payment_intent_not_confirmed')||message.includes('guardian_denial_state_conflict')||message.includes('UNIQUE constraint'))return new WalletGuardianError('GUARDIAN_STATE_CONFLICT',409,'Payment state changed concurrently.');return new WalletGuardianError('GUARDIAN_SETTLEMENT_FAILED',500,'Guardian settlement failed safely; no credit fallback was used.');}
function id(prefix){return`${prefix}_${crypto.randomUUID().replace(/-/g,'')}`;}
function json(body,status=200,extra={}){return new Response(JSON.stringify(body),{status,headers:{...JSON_HEADERS,...extra}});}
