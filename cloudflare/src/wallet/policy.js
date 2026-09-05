import {atomicFromDb} from './money.js';

export const POLICY_DECISIONS=Object.freeze({ALLOW:'ALLOW',DENY:'DENY',REQUIRE_APPROVAL:'REQUIRE_APPROVAL',QUARANTINE:'QUARANTINE'});

export function policyFromRow(row){
  if(!row)throw new Error('wallet_policy_missing');
  return{
    id:row.id,
    version:Number(row.version),
    status:row.status,
    singleTransactionLimitAtomic:atomicFromDb(row.single_transaction_limit_atomic),
    dailySpendingLimitAtomic:atomicFromDb(row.daily_spending_limit_atomic),
    rolling24hLimitAtomic:atomicFromDb(row.rolling_24h_limit_atomic),
    guardianApprovalAboveAtomic:atomicFromDb(row.guardian_approval_above_atomic),
    allowedAssets:parseArray(row.allowed_assets_json).map(x=>String(x).toUpperCase()),
    allowUnknownRecipients:Boolean(row.allow_unknown_recipients),
    allowExternalTransfer:Boolean(row.allow_external_transfer),
    requireTaskLink:Boolean(row.require_task_link),
    blockHighRiskDestinations:Boolean(row.block_high_risk_destinations)
  };
}

export function evaluateTransactionPolicy({wallet,policy,transaction,spentLast24hAtomic=0n,recipientWallet=null}){
  const amount=atomicFromDb(transaction.amountAtomic);const spent=atomicFromDb(spentLast24hAtomic);const asset=String(transaction.asset||'').toUpperCase();
  if(policy.status!=='active')return deny('POLICY_INACTIVE','Wallet policy is not active.');
  if(wallet.status!=='ACTIVE')return deny('WALLET_NOT_ACTIVE',`Wallet status ${wallet.status} does not permit autonomous outgoing payments.`);
  if(amount<=0n)return deny('INVALID_AMOUNT','Payment amount must be greater than zero.');
  if(!policy.allowedAssets.includes(asset))return deny('ASSET_NOT_SUPPORTED',`${asset||'Asset'} is not permitted by this wallet policy.`);
  if(amount>policy.singleTransactionLimitAtomic)return deny('TRANSACTION_LIMIT_EXCEEDED','Payment exceeds the policy hard per-transaction limit.');
  if(spent+amount>policy.dailySpendingLimitAtomic||spent+amount>policy.rolling24hLimitAtomic)return deny('DAILY_LIMIT_EXCEEDED','Payment would exceed the current spending window.');
  if(policy.requireTaskLink&&!transaction.taskId)return deny('TASK_LINK_REQUIRED','This wallet requires an Accord task reference for outgoing payments.');
  if(!recipientWallet&&!policy.allowUnknownRecipients)return deny('RECIPIENT_NOT_ALLOWED','Policy does not permit unknown recipients.');
  if(recipientWallet&&recipientWallet.status!=='ACTIVE')return deny('RECIPIENT_NOT_ALLOWED','Recipient wallet is not active.');
  if(amount>policy.guardianApprovalAboveAtomic)return{decision:POLICY_DECISIONS.REQUIRE_APPROVAL,code:'GUARDIAN_APPROVAL_REQUIRED',reason:'Payment is within the hard transaction limit but exceeds the autonomous approval threshold.',requiresGuardianApproval:true,policyId:policy.id,policyVersion:policy.version};
  return{decision:POLICY_DECISIONS.ALLOW,code:'ALLOW',reason:'Payment is within current wallet policy limits.',requiresGuardianApproval:false,policyId:policy.id,policyVersion:policy.version};
}

function deny(code,reason){return{decision:POLICY_DECISIONS.DENY,code,reason,requiresGuardianApproval:false};}
function parseArray(value){try{const parsed=typeof value==='string'?JSON.parse(value):value;return Array.isArray(parsed)?parsed:[];}catch{return[];}}
