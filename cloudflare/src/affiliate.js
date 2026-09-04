const JSON_HEADERS={"content-type":"application/json; charset=utf-8"};
const MAX_SKEW=10*60*1000;
const ROLES={viewer:1,responder:2,admin:3};
const DEFAULT_TERMS='affiliate-2026-09-v1';

export async function handleAffiliate(request,env,url=new URL(request.url)){
  if(!url.pathname.startsWith('/api/v1/network/'))return null;

  if(request.method==='GET'&&url.pathname==='/api/v1/network/capabilities'){
    const policy=affiliatePolicy(env);
    return reply({
      service:'AccordTrace Agent Affiliate Network',
      version:'0.1.0',
      model:'single_level_direct_product_referral',
      passport_price:{amount_atomic:policy.passport_price_atomic,currency:policy.currency},
      direct_commission:{amount_atomic:policy.commission_atomic,currency:policy.currency},
      maturity_days:policy.maturity_days,
      minimum_payout:{amount_atomic:policy.minimum_payout_atomic,currency:policy.currency},
      cash_payouts_enabled:false,
      payout_status:'ledger_only_until_payout_provider_kyc_tax_and_terms_review_are_complete',
      rules:['one_direct_referrer_only','first_qualifying_passport_sale_only','no_self_referral','no_multilevel_downline_commission','refund_or_chargeback_reverses_commission','suspicious_referrals_can_be_held_for_review','referral_activity_never_increases_trust_or_validation_status'],
      legal_boundary:'The Passport is a standalone product. Affiliate participation is separate and commission is for a qualifying direct product sale, not payment for recruiting a downline.',
      safety:'No wallet custody, credential access or third-party system control is required by this network.'
    });
  }

  if(request.method==='POST'&&url.pathname==='/api/v1/network/enroll'){
    const b=await bodyJson(request);
    const passportId=cleanId(b.passport_id,'passport_id');
    const passport=await activePassport(env,passportId);
    const requestId=cleanId(b.request_id,'request_id');
    const termsVersion=text(b.terms_version,80)||DEFAULT_TERMS;
    const requestedAt=freshIso(b.requested_at);
    const payload={domain:'accordtrace.affiliate.enroll.v1',request_id:requestId,passport_id:passportId,terms_version:termsVersion,requested_at:requestedAt};
    await verifyEd25519(passport.public_key,canonicalize(payload),b.signature);
    const existing=await env.DB.prepare(`SELECT passport_id,referral_code,status,terms_version,accepted_at FROM affiliate_profiles WHERE passport_id=?1`).bind(passportId).first();
    if(existing)return reply({affiliate:profileView(existing),idempotent:true});
    const now=new Date().toISOString();
    const code=`atr_${randomHex(8)}`;
    const statements=[
      env.DB.prepare(`INSERT INTO affiliate_request_nonces(request_id,passport_id,purpose,created_at) VALUES(?1,?2,'enroll',?3)`).bind(requestId,passportId,now),
      env.DB.prepare(`INSERT INTO affiliate_profiles(passport_id,referral_code,status,terms_version,enrollment_request_id,accepted_at,created_at,updated_at) VALUES(?1,?2,'active',?3,?4,?5,?5,?5)`).bind(passportId,code,termsVersion,requestId,requestedAt)
    ];
    try{if(typeof env.DB.batch==='function')await env.DB.batch(statements);else{await statements[0].run();await statements[1].run();}}catch(error){throw new AffiliateError('affiliate_enrollment_conflict',409)}
    return reply({affiliate:{passport_id:passportId,referral_code:code,status:'active',terms_version:termsVersion,accepted_at:requestedAt},referral_url:`${publicBase(env,url)}/network.html?ref=${encodeURIComponent(code)}`},201);
  }

  const referralMatch=url.pathname.match(/^\/api\/v1\/network\/referrals\/([^/]+)$/);
  if(request.method==='GET'&&referralMatch){
    const code=cleanCode(decodeURIComponent(referralMatch[1]));
    const row=await env.DB.prepare(`SELECT passport_id,referral_code,status,created_at FROM affiliate_profiles WHERE referral_code=?1`).bind(code).first();
    if(!row||row.status!=='active')return reply({error:'referral_not_active'},404);
    return reply({referral:{code:row.referral_code,referrer_passport_id:row.passport_id,status:'active',created_at:row.created_at},disclosure:'A referral may generate a direct cash commission after a qualifying product sale. It does not affect Trust, validation or security status.'});
  }

  if(request.method==='POST'&&url.pathname==='/api/v1/network/attributions/reserve'){
    const b=await bodyJson(request);
    const referredPassportId=cleanId(b.referred_passport_id,'referred_passport_id');
    const passport=await activePassport(env,referredPassportId);
    const referralCode=cleanCode(b.referral_code);
    const referrer=await env.DB.prepare(`SELECT passport_id,referral_code,status FROM affiliate_profiles WHERE referral_code=?1`).bind(referralCode).first();
    if(!referrer||referrer.status!=='active')return reply({error:'referral_not_active'},404);
    if(referrer.passport_id===referredPassportId)return reply({error:'self_referral_not_allowed'},422);
    const requestId=cleanId(b.request_id,'request_id');const requestedAt=freshIso(b.requested_at);
    const payload={domain:'accordtrace.affiliate.reserve.v1',request_id:requestId,referral_code:referralCode,referred_passport_id:referredPassportId,requested_at:requestedAt};
    await verifyEd25519(passport.public_key,canonicalize(payload),b.signature);
    const existing=await env.DB.prepare(`SELECT id,referrer_passport_id,referred_passport_id,referral_code,state,risk_flags_json,attributed_at FROM affiliate_attributions WHERE referred_passport_id=?1`).bind(referredPassportId).first();
    if(existing)return reply({attribution:attributionView(existing),idempotent:true});
    const reciprocal=await env.DB.prepare(`SELECT id FROM affiliate_attributions WHERE referrer_passport_id=?1 AND referred_passport_id=?2 LIMIT 1`).bind(referredPassportId,referrer.passport_id).first();
    const flags=reciprocal?['reciprocal_referral_review']:[];const state=flags.length?'held':'reserved';const id=`ata_${randomHex(16)}`;const now=new Date().toISOString();
    const statements=[
      env.DB.prepare(`INSERT INTO affiliate_request_nonces(request_id,passport_id,purpose,created_at) VALUES(?1,?2,'reserve',?3)`).bind(requestId,referredPassportId,now),
      env.DB.prepare(`INSERT INTO affiliate_attributions(id,referrer_passport_id,referred_passport_id,referral_code,state,risk_flags_json,attributed_at,created_at,updated_at) VALUES(?1,?2,?3,?4,?5,?6,?7,?8,?8)`).bind(id,referrer.passport_id,referredPassportId,referralCode,state,JSON.stringify(flags),requestedAt,now)
    ];
    try{if(typeof env.DB.batch==='function')await env.DB.batch(statements);else{await statements[0].run();await statements[1].run();}}catch{throw new AffiliateError('affiliate_attribution_conflict',409)}
    return reply({attribution:{id,referrer_passport_id:referrer.passport_id,referred_passport_id:referredPassportId,referral_code:referralCode,state,risk_flags:flags,attributed_at:requestedAt},next_step:'A commission is created only after an authorized settlement source confirms a qualifying Passport product sale.'},201);
  }

  const summaryMatch=url.pathname.match(/^\/api\/v1\/network\/passports\/([^/]+)\/summary$/);
  if(request.method==='GET'&&summaryMatch){
    const passportId=cleanId(decodeURIComponent(summaryMatch[1]),'passport_id');
    const profile=await env.DB.prepare(`SELECT passport_id,referral_code,status,created_at FROM affiliate_profiles WHERE passport_id=?1`).bind(passportId).first();
    if(!profile)return reply({error:'affiliate_profile_not_found'},404);
    const counts=await env.DB.prepare(`SELECT COUNT(*) AS total, SUM(CASE WHEN state='qualified' THEN 1 ELSE 0 END) AS qualified, SUM(CASE WHEN state='held' THEN 1 ELSE 0 END) AS held FROM affiliate_attributions WHERE referrer_passport_id=?1`).bind(passportId).first();
    return reply({passport_id:passportId,network_contribution:{direct_introductions:Number(counts?.total||0),qualified_direct_sales:Number(counts?.qualified||0),held_for_review:Number(counts?.held||0)},trust_effect:'none',note:'Referral activity is a distribution metric only and never increases Trust or validation status.'});
  }

  if(request.method==='POST'&&url.pathname==='/api/v1/network/balance'){
    const b=await bodyJson(request);const passportId=cleanId(b.passport_id,'passport_id');const passport=await activePassport(env,passportId);const requestId=cleanId(b.request_id,'request_id');const requestedAt=freshIso(b.requested_at);
    const payload={domain:'accordtrace.affiliate.balance.v1',request_id:requestId,passport_id:passportId,requested_at:requestedAt};await verifyEd25519(passport.public_key,canonicalize(payload),b.signature);
    await consumeNonce(env,requestId,passportId,'balance');
    const rows=await env.DB.prepare(`SELECT state,SUM(amount_atomic) AS amount_atomic,COUNT(*) AS commissions FROM affiliate_commissions WHERE referrer_passport_id=?1 GROUP BY state`).bind(passportId).all();
    const policy=affiliatePolicy(env);return reply({passport_id:passportId,currency:policy.currency,minimum_payout_atomic:policy.minimum_payout_atomic,cash_payouts_enabled:false,balances:rows.results||[],note:'Balances are ledger evidence only until a compliant payout provider, KYC/tax flow and final affiliate terms are enabled.'});
  }

  if(url.pathname.startsWith('/api/v1/network/admin/')){
    const auth=await authenticateOperator(request,env);requireRole(auth,'responder');

    if(request.method==='POST'&&url.pathname==='/api/v1/network/admin/settlements/qualify'){
      const b=await bodyJson(request);const attributionId=cleanId(b.attribution_id,'attribution_id');const orderRef=text(b.external_order_ref,500);if(!orderRef)throw new AffiliateError('external_order_ref_required',400);const identityRef=text(b.payment_identity_ref,500);if(!identityRef)throw new AffiliateError('payment_identity_ref_required',400);
      const gross=boundedInt(b.gross_amount_atomic,1,1000000000);const currency=String(b.currency||'').toLowerCase();const policy=affiliatePolicy(env);if(currency!==policy.currency)return reply({error:'affiliate_currency_mismatch',expected:policy.currency},422);if(gross<policy.passport_price_atomic)return reply({error:'qualifying_sale_amount_too_low',minimum_atomic:policy.passport_price_atomic},422);
      const attribution=await env.DB.prepare(`SELECT * FROM affiliate_attributions WHERE id=?1`).bind(attributionId).first();if(!attribution)return reply({error:'attribution_not_found'},404);if(!['reserved','held'].includes(attribution.state))return reply({error:'attribution_not_qualifiable',state:attribution.state},409);
      const orderDigest=await sha256Hex(`accordtrace.affiliate.order.v1:${orderRef}`);const identityDigest=await sha256Hex(`accordtrace.affiliate.payment_identity.v1:${identityRef}`);
      const duplicateOrder=await env.DB.prepare(`SELECT id FROM affiliate_attributions WHERE external_order_ref_digest=?1 AND id<>?2 LIMIT 1`).bind(orderDigest,attributionId).first();if(duplicateOrder)return reply({error:'settlement_order_already_used'},409);
      const reusedIdentity=await env.DB.prepare(`SELECT COUNT(DISTINCT referred_passport_id) AS count FROM affiliate_attributions WHERE payment_identity_digest=?1 AND id<>?2`).bind(identityDigest,attributionId).first();
      const existingFlags=safeJson(attribution.risk_flags_json)||[];const flags=[...new Set([...existingFlags,...(Number(reusedIdentity?.count||0)>0?['shared_payment_identity_review']:[])])];const nextState=flags.length?'held':'qualified';const now=new Date().toISOString();const availableAt=new Date(Date.now()+policy.maturity_days*86400000).toISOString();const commissionId=`atc_${randomHex(16)}`;const commissionState=flags.length?'held':'pending';
      const statements=[
        env.DB.prepare(`UPDATE affiliate_attributions SET state=?1,risk_flags_json=?2,external_order_ref_digest=?3,payment_identity_digest=?4,gross_amount_atomic=?5,currency=?6,qualified_at=CASE WHEN ?1='qualified' THEN ?7 ELSE qualified_at END,updated_at=?7 WHERE id=?8 AND state IN ('reserved','held')`).bind(nextState,JSON.stringify(flags),orderDigest,identityDigest,gross,currency,now,attributionId),
        env.DB.prepare(`INSERT INTO affiliate_commissions(id,attribution_id,referrer_passport_id,referred_passport_id,amount_atomic,currency,state,available_at,created_at,updated_at,held_at) VALUES(?1,?2,?3,?4,?5,?6,?7,?8,?9,?9,CASE WHEN ?7='held' THEN ?9 ELSE NULL END)`).bind(commissionId,attributionId,attribution.referrer_passport_id,attribution.referred_passport_id,policy.commission_atomic,currency,commissionState,availableAt,now),
        ledgerStatement(env,{commissionId,referrerPassportId:attribution.referrer_passport_id,eventType:'created',amountDelta:policy.commission_atomic,currency,reasonCode:flags.length?'created_held_for_review':'qualifying_direct_sale',createdAt:now})
      ];
      try{if(typeof env.DB.batch==='function')await env.DB.batch(statements);else for(const s of statements)await s.run();}catch{throw new AffiliateError('affiliate_settlement_conflict',409)}
      return reply({attribution_id:attributionId,state:nextState,risk_flags:flags,commission:{id:commissionId,state:commissionState,amount_atomic:policy.commission_atomic,currency,available_at:availableAt},payout:'disabled_until_compliance_activation'});
    }

    if(request.method==='POST'&&url.pathname==='/api/v1/network/admin/settlements/reverse'){
      const b=await bodyJson(request);const orderRef=text(b.external_order_ref,500);if(!orderRef)throw new AffiliateError('external_order_ref_required',400);const reason=text(b.reason_code,80)||'refund_or_chargeback';const digest=await sha256Hex(`accordtrace.affiliate.order.v1:${orderRef}`);
      const attribution=await env.DB.prepare(`SELECT id,state FROM affiliate_attributions WHERE external_order_ref_digest=?1`).bind(digest).first();if(!attribution)return reply({error:'affiliate_settlement_not_found'},404);
      const commission=await env.DB.prepare(`SELECT * FROM affiliate_commissions WHERE attribution_id=?1`).bind(attribution.id).first();if(!commission)return reply({error:'affiliate_commission_not_found'},404);if(commission.state==='reversed')return reply({commission_id:commission.id,state:'reversed',idempotent:true});if(commission.state==='paid')return reply({error:'paid_commission_requires_manual_recovery_review'},409);
      const now=new Date().toISOString();const statements=[env.DB.prepare(`UPDATE affiliate_attributions SET state='reversed',reversed_at=?1,updated_at=?1 WHERE id=?2`).bind(now,attribution.id),env.DB.prepare(`UPDATE affiliate_commissions SET state='reversed',reversed_at=?1,updated_at=?1 WHERE id=?2 AND state IN ('pending','earned','held')`).bind(now,commission.id),ledgerStatement(env,{commissionId:commission.id,referrerPassportId:commission.referrer_passport_id,eventType:'reversed',amountDelta:-Number(commission.amount_atomic),currency:commission.currency,reasonCode:reason,createdAt:now})];
      if(typeof env.DB.batch==='function')await env.DB.batch(statements);else for(const s of statements)await s.run();return reply({attribution_id:attribution.id,commission_id:commission.id,state:'reversed',reason_code:reason});
    }

    if(request.method==='POST'&&url.pathname==='/api/v1/network/admin/commissions/mature'){
      requireRole(auth,'admin');const result=await matureAffiliateCommissions(env);return reply(result);
    }
  }

  return reply({error:'not_found'},404);
}

export async function matureAffiliateCommissions(env,nowMs=Date.now()){
  const now=new Date(nowMs).toISOString();const rows=await env.DB.prepare(`SELECT id,referrer_passport_id,amount_atomic,currency FROM affiliate_commissions WHERE state='pending' AND available_at<=?1 ORDER BY available_at LIMIT 500`).bind(now).all();let matured=0;
  for(const row of rows.results||[]){const update=await env.DB.prepare(`UPDATE affiliate_commissions SET state='earned',earned_at=?1,updated_at=?1 WHERE id=?2 AND state='pending'`).bind(now,row.id).run();if(Number(update.meta?.changes||0)!==1)continue;await ledgerStatement(env,{commissionId:row.id,referrerPassportId:row.referrer_passport_id,eventType:'earned',amountDelta:0,currency:row.currency,reasonCode:'maturity_window_completed',createdAt:now}).run();matured++;}
  return{matured,generated_at:now,cash_payouts_enabled:false};
}

function affiliatePolicy(env){const currency=String(env.AFFILIATE_CURRENCY||'usd').toLowerCase();return{currency,passport_price_atomic:boundedEnvInt(env.AFFILIATE_PASSPORT_PRICE_ATOMIC,200,1,1000000),commission_atomic:boundedEnvInt(env.AFFILIATE_COMMISSION_ATOMIC,100,1,1000000),maturity_days:boundedEnvInt(env.AFFILIATE_MATURITY_DAYS,14,1,90),minimum_payout_atomic:boundedEnvInt(env.AFFILIATE_MINIMUM_PAYOUT_ATOMIC,1000,1,100000000)}}
async function activePassport(env,id){const row=await env.DB.prepare(`SELECT id,public_key,status FROM agent_passports WHERE id=?1`).bind(id).first();if(!row||row.status!=='active')throw new AffiliateError('passport_not_active',404);return row}
async function consumeNonce(env,requestId,passportId,purpose){const now=new Date().toISOString();try{await env.DB.prepare(`INSERT INTO affiliate_request_nonces(request_id,passport_id,purpose,created_at) VALUES(?1,?2,?3,?4)`).bind(requestId,passportId,purpose,now).run();}catch{throw new AffiliateError('request_replay_detected',409)}}
function ledgerStatement(env,{commissionId,referrerPassportId,eventType,amountDelta,currency,reasonCode,createdAt}){const id=`atl_${randomHex(16)}`;const material=`${commissionId}|${referrerPassportId}|${eventType}|${amountDelta}|${currency}|${reasonCode}|${createdAt}|${id}`;return env.DB.prepare(`INSERT INTO affiliate_ledger_events(id,commission_id,referrer_passport_id,event_type,amount_delta_atomic,currency,reason_code,event_digest,created_at) VALUES(?1,?2,?3,?4,?5,?6,?7,?8,?9)`).bind(id,commissionId,referrerPassportId,eventType,amountDelta,currency,reasonCode,simpleDigestMaterial(material),createdAt)}
function simpleDigestMaterial(v){let h=2166136261;for(let i=0;i<v.length;i++){h^=v.charCodeAt(i);h=Math.imul(h,16777619)}return`fnv1a32:${(h>>>0).toString(16).padStart(8,'0')}:${randomHex(8)}`}
async function authenticateOperator(request,env){const h=request.headers.get('authorization')||'';const m=h.match(/^Bearer\s+(.+)$/i);if(!m)throw new AffiliateError('authentication_required',401);const presented=await sha256Hex(m[1]);const entries=safeJson(env.CONTROL_PLANE_RBAC_JSON)||[];for(const entry of Array.isArray(entries)?entries:[]){if(entry&&entry.token_sha256===presented&&ROLES[entry.role])return{ref:String(entry.operator_ref||'operator'),role:entry.role};}throw new AffiliateError('invalid_operator_token',401)}
function requireRole(auth,role){if((ROLES[auth.role]||0)<ROLES[role])throw new AffiliateError('insufficient_role',403)}
function publicBase(env,url){const raw=String(env.PUBLIC_BASE_URL||url.origin).replace(/\/$/,'');let u;try{u=new URL(raw)}catch{throw new AffiliateError('invalid_public_base_url',500)}if(u.protocol!=='https:'&&u.hostname!=='localhost')throw new AffiliateError('public_base_url_must_be_https',500);return u.origin}
function profileView(r){return{passport_id:r.passport_id,referral_code:r.referral_code,status:r.status,terms_version:r.terms_version,accepted_at:r.accepted_at}}
function attributionView(r){return{id:r.id,referrer_passport_id:r.referrer_passport_id,referred_passport_id:r.referred_passport_id,referral_code:r.referral_code,state:r.state,risk_flags:safeJson(r.risk_flags_json)||[],attributed_at:r.attributed_at}}
function freshIso(v){const t=Date.parse(v);if(!Number.isFinite(t)||Math.abs(Date.now()-t)>MAX_SKEW)throw new AffiliateError('timestamp_out_of_range',400);return new Date(t).toISOString()}
function cleanId(v,n){const s=String(v||'').trim();if(!/^[A-Za-z0-9][A-Za-z0-9._:-]{0,199}$/.test(s))throw new AffiliateError(`${n}_invalid`,400);return s}
function cleanCode(v){const s=String(v||'').trim().toLowerCase();if(!/^atr_[a-f0-9]{16}$/.test(s))throw new AffiliateError('referral_code_invalid',400);return s}
function text(v,n){return String(v??'').trim().slice(0,n)}function safeJson(v){if(!v)return null;if(typeof v==='object')return v;try{return JSON.parse(v)}catch{return null}}
function boundedInt(v,min,max){const n=Number(v);if(!Number.isSafeInteger(n)||n<min||n>max)throw new AffiliateError('integer_out_of_range',400);return n}function boundedEnvInt(v,d,min,max){if(v===undefined||v===null||v==='')return d;return boundedInt(v,min,max)}
function randomHex(n){const b=crypto.getRandomValues(new Uint8Array(n));return[...b].map(x=>x.toString(16).padStart(2,'0')).join('')}
async function sha256Hex(v){const d=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(String(v)));return[...new Uint8Array(d)].map(x=>x.toString(16).padStart(2,'0')).join('')}
async function verifyEd25519(pem,msg,sig){if(!sig)throw new AffiliateError('signature_required',400);let key;try{key=await crypto.subtle.importKey('spki',pemBytes(pem),{name:'Ed25519'},false,['verify'])}catch{throw new AffiliateError('invalid_public_key',422)}let ok=false;try{ok=await crypto.subtle.verify({name:'Ed25519'},key,b64(sig),new TextEncoder().encode(msg))}catch{}if(!ok)throw new AffiliateError('signature_verification_failed',401)}
function pemBytes(p){const b=String(p||'').replace(/-----BEGIN PUBLIC KEY-----|-----END PUBLIC KEY-----|\s/g,'');return Uint8Array.from(atob(b),c=>c.charCodeAt(0))}function b64(v){const n=String(v||'').replace(/-/g,'+').replace(/_/g,'/');return Uint8Array.from(atob(n+'='.repeat((4-n.length%4)%4)),c=>c.charCodeAt(0))}
function canonicalize(v){if(v===null||typeof v==='boolean'||typeof v==='string'||typeof v==='number')return JSON.stringify(v);if(Array.isArray(v))return`[${v.map(canonicalize).join(',')}]`;if(typeof v==='object')return`{${Object.keys(v).sort().map(k=>`${JSON.stringify(k)}:${canonicalize(v[k])}`).join(',')}}`;throw new AffiliateError('unsupported_value',400)}
async function bodyJson(r){try{return await r.json()}catch{throw new AffiliateError('request_body_must_be_json',400)}}
function reply(body,status=200){return new Response(JSON.stringify(body),{status,headers:JSON_HEADERS})}
export class AffiliateError extends Error{constructor(message,status=400){super(message);this.status=status}}
