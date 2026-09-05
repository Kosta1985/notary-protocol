import {canonicalize,sha256Hex} from './wallet-auth.js';
import {formatAssetAmount,atomicFromDb} from './wallet/money.js';

export async function buildWalletReceipt(input){
  const createdAt=input.timestamp||new Date().toISOString();
  const receiptId=input.receiptId||`afr_${crypto.randomUUID().replace(/-/g,'')}`;
  const body={
    receiptType:String(input.receiptType||'FINANCIAL_EVENT'),
    receiptId,
    agentId:input.agentId||null,
    wallet:input.wallet||null,
    action:String(input.action||'UNKNOWN'),
    recipientAgentId:input.recipientAgentId||null,
    amount:input.amountAtomic===undefined||input.amountAtomic===null?null:formatAssetAmount(atomicFromDb(input.amountAtomic),input.asset||'USDC'),
    amountAtomic:input.amountAtomic===undefined||input.amountAtomic===null?null:atomicFromDb(input.amountAtomic).toString(),
    asset:input.asset||null,
    purpose:input.purpose||null,
    taskId:input.taskId||null,
    policyDecision:input.policyDecision||null,
    policyCode:input.policyCode||null,
    guardianApproval:Boolean(input.guardianApproval),
    provider:input.provider||null,
    network:input.network||null,
    settlementMode:input.settlementMode||null,
    transactionRef:input.transactionRef||null,
    blockchainTransactionHash:input.blockchainTransactionHash||null,
    status:String(input.status||'RECORDED'),
    reason:input.reason||null,
    timestamp:createdAt,
    integrityMode:'hash_bound_service_record',
    limitations:['Integrity records show what AccordTrace recorded. They do not prove legal ownership, real-world truth, or independent financial solvency.']
  };
  const payloadHash=await sha256Hex(canonicalize(body));
  return{...body,payloadHash};
}

export function receiptInsert(env,receipt){
  return env.DB.prepare(`INSERT INTO receipts (id,deal_id,evidence_digest,valid,verified_at,receipt) VALUES (?1,'accordtrace-financial-v1',?2,1,?3,?4)`).bind(receipt.receiptId,receipt.payloadHash,receipt.timestamp,JSON.stringify(receipt));
}
