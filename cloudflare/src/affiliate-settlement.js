const DEFAULT_MATURITY_DAYS=14;

export async function qualifyDirectAffiliateSale(env,{attributionId,externalOrderRef,paymentIdentityRef,grossAmountAtomic,currency,nowMs=Date.now()}){
  if(!attributionId)return{eligible:false,reason:'no_referral_attribution'};
  const policy=policyFor(env);
  const gross=boundedInt(grossAmountAtomic,1,1_000_000_000);
  const normalizedCurrency=String(currency||'').toLowerCase();
  if(normalizedCurrency!==policy.currency)return{eligible:false,reason:'currency_mismatch',expected_currency:policy.currency};
  if(gross<policy.passportPriceAtomic)return{eligible:false,reason:'qualifying_sale_amount_too_low',minimum_atomic:policy.passportPriceAtomic};
  const orderRef=String(externalOrderRef||'').trim();
  const identityRef=String(paymentIdentityRef||'').trim();
  if(!orderRef||!identityRef)throw new AffiliateSettlementError('settlement_reference_required',400);

  const attribution=await env.DB.prepare(`SELECT * FROM affiliate_attributions WHERE id=?1`).bind(attributionId).first();
  if(!attribution)return{eligible:false,reason:'attribution_not_found'};

  const orderDigest=await sha256Hex(`accordtrace.affiliate.order.v1:${orderRef}`);
  const identityDigest=await sha256Hex(`accordtrace.affiliate.payment_identity.v1:${identityRef}`);
  const existingCommission=await env.DB.prepare(`SELECT * FROM affiliate_commissions WHERE attribution_id=?1`).bind(attributionId).first();
  if(existingCommission){
    if(attribution.external_order_ref_digest===orderDigest)return{eligible:true,idempotent:true,attribution_id:attributionId,state:attribution.state,commission:commissionView(existingCommission)};
    return{eligible:false,reason:'attribution_already_consumed_by_another_order'};
  }
  if(!['reserved','held'].includes(attribution.state))return{eligible:false,reason:'attribution_not_qualifiable',state:attribution.state};

  const duplicateOrder=await env.DB.prepare(`SELECT id FROM affiliate_attributions WHERE external_order_ref_digest=?1 AND id<>?2 LIMIT 1`).bind(orderDigest,attributionId).first();
  if(duplicateOrder)return{eligible:false,reason:'settlement_order_already_used'};

  const reusedIdentity=await env.DB.prepare(`SELECT COUNT(DISTINCT referred_passport_id) AS count FROM affiliate_attributions WHERE payment_identity_digest=?1 AND id<>?2`).bind(identityDigest,attributionId).first();
  const profile=await env.DB.prepare(`SELECT status FROM affiliate_profiles WHERE passport_id=?1`).bind(attribution.referrer_passport_id).first();
  const existingFlags=safeJson(attribution.risk_flags_json)||[];
  const flags=[...new Set([
    ...existingFlags,
    ...(Number(reusedIdentity?.count||0)>0?['shared_payment_identity_review']:[]),
    ...(!profile||profile.status!=='active'?['referrer_profile_inactive_review']:[])
  ])];
  const nextState=flags.length?'held':'qualified';
  const now=new Date(nowMs).toISOString();
  const availableAt=new Date(nowMs+policy.maturityDays*86_400_000).toISOString();
  const commissionId=`atc_${randomHex(16)}`;
  const commissionState=flags.length?'held':'pending';
  const statements=[
    env.DB.prepare(`UPDATE affiliate_attributions SET state=?1,risk_flags_json=?2,external_order_ref_digest=?3,payment_identity_digest=?4,gross_amount_atomic=?5,currency=?6,qualified_at=CASE WHEN ?1='qualified' THEN ?7 ELSE qualified_at END,updated_at=?7 WHERE id=?8 AND state IN ('reserved','held')`).bind(nextState,JSON.stringify(flags),orderDigest,identityDigest,gross,normalizedCurrency,now,attributionId),
    env.DB.prepare(`INSERT INTO affiliate_commissions(id,attribution_id,referrer_passport_id,referred_passport_id,amount_atomic,currency,state,available_at,created_at,updated_at,held_at) VALUES(?1,?2,?3,?4,?5,?6,?7,?8,?9,?9,CASE WHEN ?7='held' THEN ?9 ELSE NULL END)`).bind(commissionId,attributionId,attribution.referrer_passport_id,attribution.referred_passport_id,policy.commissionAtomic,normalizedCurrency,commissionState,availableAt,now),
    ledgerStatement(env,{commissionId,referrerPassportId:attribution.referrer_passport_id,eventType:'created',amountDelta:policy.commissionAtomic,currency:normalizedCurrency,reasonCode:flags.length?'created_held_for_review':'qualifying_direct_sale',createdAt:now})
  ];
  let results;
  try{results=typeof env.DB.batch==='function'?await env.DB.batch(statements):[await statements[0].run(),await statements[1].run(),await statements[2].run()];}
  catch{throw new AffiliateSettlementError('affiliate_settlement_conflict',409)}
  if(Number(results?.[0]?.meta?.changes??1)!==1)throw new AffiliateSettlementError('affiliate_attribution_race_lost',409);
  return{eligible:true,attribution_id:attributionId,state:nextState,risk_flags:flags,commission:{id:commissionId,state:commissionState,amount_atomic:policy.commissionAtomic,currency:normalizedCurrency,available_at:availableAt},cash_payouts_enabled:false};
}

export async function reverseDirectAffiliateSale(env,{externalOrderRef,reasonCode='refund_or_chargeback',nowMs=Date.now()}){
  const orderRef=String(externalOrderRef||'').trim();
  if(!orderRef)throw new AffiliateSettlementError('external_order_ref_required',400);
  const digest=await sha256Hex(`accordtrace.affiliate.order.v1:${orderRef}`);
  const attribution=await env.DB.prepare(`SELECT id,state FROM affiliate_attributions WHERE external_order_ref_digest=?1`).bind(digest).first();
  if(!attribution)return{reversed:false,reason:'affiliate_settlement_not_found'};
  const commission=await env.DB.prepare(`SELECT * FROM affiliate_commissions WHERE attribution_id=?1`).bind(attribution.id).first();
  if(!commission)return{reversed:false,reason:'affiliate_commission_not_found'};
  if(commission.state==='reversed')return{reversed:true,idempotent:true,commission_id:commission.id};
  if(commission.state==='paid')return{reversed:false,reason:'paid_commission_requires_manual_recovery_review',commission_id:commission.id};
  const now=new Date(nowMs).toISOString();
  const reason=String(reasonCode||'refund_or_chargeback').slice(0,80);
  const statements=[
    env.DB.prepare(`UPDATE affiliate_attributions SET state='reversed',reversed_at=?1,updated_at=?1 WHERE id=?2 AND state<>'reversed'`).bind(now,attribution.id),
    env.DB.prepare(`UPDATE affiliate_commissions SET state='reversed',reversed_at=?1,updated_at=?1 WHERE id=?2 AND state IN ('pending','earned','held')`).bind(now,commission.id),
    ledgerStatement(env,{commissionId:commission.id,referrerPassportId:commission.referrer_passport_id,eventType:'reversed',amountDelta:-Number(commission.amount_atomic),currency:commission.currency,reasonCode:reason,createdAt:now})
  ];
  if(typeof env.DB.batch==='function')await env.DB.batch(statements);else for(const statement of statements)await statement.run();
  return{reversed:true,attribution_id:attribution.id,commission_id:commission.id,reason_code:reason};
}

function policyFor(env){return{currency:String(env.AFFILIATE_CURRENCY||'usd').toLowerCase(),passportPriceAtomic:envInt(env.AFFILIATE_PASSPORT_PRICE_ATOMIC,200,1,1_000_000),commissionAtomic:envInt(env.AFFILIATE_COMMISSION_ATOMIC,100,1,1_000_000),maturityDays:envInt(env.AFFILIATE_MATURITY_DAYS,DEFAULT_MATURITY_DAYS,1,90)}}
function commissionView(row){return{id:row.id,state:row.state,amount_atomic:Number(row.amount_atomic),currency:row.currency,available_at:row.available_at}}
function ledgerStatement(env,{commissionId,referrerPassportId,eventType,amountDelta,currency,reasonCode,createdAt}){const id=`atl_${randomHex(16)}`;const material=`${commissionId}|${referrerPassportId}|${eventType}|${amountDelta}|${currency}|${reasonCode}|${createdAt}|${id}`;return env.DB.prepare(`INSERT INTO affiliate_ledger_events(id,commission_id,referrer_passport_id,event_type,amount_delta_atomic,currency,reason_code,event_digest,created_at) VALUES(?1,?2,?3,?4,?5,?6,?7,?8,?9)`).bind(id,commissionId,referrerPassportId,eventType,amountDelta,currency,reasonCode,eventDigest(material),createdAt)}
function eventDigest(value){let h=2166136261;for(let i=0;i<value.length;i++){h^=value.charCodeAt(i);h=Math.imul(h,16777619)}return`fnv1a32:${(h>>>0).toString(16).padStart(8,'0')}:${randomHex(8)}`}
function safeJson(v){if(!v)return null;if(typeof v==='object')return v;try{return JSON.parse(v)}catch{return null}}
function envInt(v,d,min,max){if(v===undefined||v===null||v==='')return d;return boundedInt(v,min,max)}
function boundedInt(v,min,max){const n=Number(v);if(!Number.isSafeInteger(n)||n<min||n>max)throw new AffiliateSettlementError('integer_out_of_range',400);return n}
function randomHex(n){const b=crypto.getRandomValues(new Uint8Array(n));return[...b].map(x=>x.toString(16).padStart(2,'0')).join('')}
async function sha256Hex(v){const d=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(String(v)));return[...new Uint8Array(d)].map(x=>x.toString(16).padStart(2,'0')).join('')}
export class AffiliateSettlementError extends Error{constructor(message,status=400){super(message);this.status=status}}
