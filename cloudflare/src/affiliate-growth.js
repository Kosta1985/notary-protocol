const JSON_HEADERS={"content-type":"application/json; charset=utf-8"};
const MAX_SKEW=10*60*1000;

export async function handleAffiliateGrowth(request,env,url=new URL(request.url)){
  if(!url.pathname.startsWith('/api/v1/network/'))return null;

  if(request.method==='GET'&&url.pathname==='/api/v1/network/stats'){
    const policy=affiliatePolicy(env);
    const [profiles,attributions,commissions,invites]=await Promise.all([
      env.DB.prepare(`SELECT COUNT(*) AS total,SUM(CASE WHEN status='active' THEN 1 ELSE 0 END) AS active FROM affiliate_profiles`).first(),
      env.DB.prepare(`SELECT COUNT(*) AS total,SUM(CASE WHEN state='reserved' THEN 1 ELSE 0 END) AS reserved,SUM(CASE WHEN state='held' THEN 1 ELSE 0 END) AS held,SUM(CASE WHEN state='qualified' THEN 1 ELSE 0 END) AS qualified,SUM(CASE WHEN state='rejected' THEN 1 ELSE 0 END) AS rejected,SUM(CASE WHEN state='reversed' THEN 1 ELSE 0 END) AS reversed FROM affiliate_attributions`).first(),
      env.DB.prepare(`SELECT COUNT(*) AS total,SUM(CASE WHEN state='pending' THEN 1 ELSE 0 END) AS pending,SUM(CASE WHEN state='earned' THEN 1 ELSE 0 END) AS earned,SUM(CASE WHEN state='held' THEN 1 ELSE 0 END) AS held,SUM(CASE WHEN state='reversed' THEN 1 ELSE 0 END) AS reversed,SUM(CASE WHEN state='paid' THEN 1 ELSE 0 END) AS paid,SUM(CASE WHEN state='pending' THEN amount_atomic ELSE 0 END) AS pending_atomic,SUM(CASE WHEN state='earned' THEN amount_atomic ELSE 0 END) AS earned_atomic,SUM(CASE WHEN state='paid' THEN amount_atomic ELSE 0 END) AS paid_atomic FROM affiliate_commissions`).first(),
      env.DB.prepare(`SELECT COUNT(*) AS total,SUM(CASE WHEN created_at>=datetime('now','-30 days') THEN 1 ELSE 0 END) AS last_30d FROM affiliate_request_nonces WHERE purpose='invite'`).first()
    ]);
    const totalAttrib=n(attributions?.total),qualified=n(attributions?.qualified);
    return reply({
      service:'AccordTrace Agent Affiliate Network',
      model:'single_level_direct_product_referral',
      currency:policy.currency,
      passport_price_atomic:policy.passport_price_atomic,
      direct_commission_atomic:policy.commission_atomic,
      cash_payouts_enabled:false,
      affiliates:{total:n(profiles?.total),active:n(profiles?.active)},
      invitation_payloads:{total:n(invites?.total),last_30d:n(invites?.last_30d),classification:'generated_payloads_not_sales'},
      attributions:{total:totalAttrib,reserved:n(attributions?.reserved),held:n(attributions?.held),qualified_direct_sales:qualified,rejected:n(attributions?.rejected),reversed:n(attributions?.reversed)},
      commissions:{total:n(commissions?.total),pending:n(commissions?.pending),earned:n(commissions?.earned),held:n(commissions?.held),reversed:n(commissions?.reversed),paid:n(commissions?.paid),pending_amount_atomic:n(commissions?.pending_atomic),earned_amount_atomic:n(commissions?.earned_atomic),paid_amount_atomic:n(commissions?.paid_atomic)},
      conversions:{attribution_to_qualified_sale:totalAttrib?Number((qualified/totalAttrib).toFixed(4)):0},
      boundary:'Counts represent recorded network states. An invitation is not a customer, sale, earned commission or paid commission. Referral activity never changes Trust or validation status.'
    });
  }

  if(request.method==='POST'&&url.pathname==='/api/v1/network/invitations'){
    const b=await bodyJson(request);
    const passportId=cleanId(b.passport_id,'passport_id');
    const passport=await activePassport(env,passportId);
    const profile=await env.DB.prepare(`SELECT passport_id,referral_code,status FROM affiliate_profiles WHERE passport_id=?1`).bind(passportId).first();
    if(!profile||profile.status!=='active')return reply({error:'affiliate_profile_not_active'},404);
    const requestId=cleanId(b.request_id,'request_id');
    const requestedAt=freshIso(b.requested_at);
    const recipientContext=text(b.recipient_context,500)||null;
    const payload={domain:'accordtrace.affiliate.invitation.v1',request_id:requestId,passport_id:passportId,recipient_context:recipientContext,requested_at:requestedAt};
    await verifyEd25519(passport.public_key,canonicalize(payload),b.signature);
    await consumeNonce(env,requestId,passportId,'invite');
    const policy=affiliatePolicy(env);
    const base=publicBase(env,url);
    const referralUrl=`${base}/network.html?ref=${encodeURIComponent(profile.referral_code)}`;
    const context=recipientContext?` Context: ${recipientContext}`:'';
    const disclosure=`The referring Passport may earn a direct ${money(policy.commission_atomic,policy.currency)} commission only if you independently complete a qualifying ${money(policy.passport_price_atomic,policy.currency)} Agent Passport purchase after settlement and review. No downline commission applies. Referral activity does not affect Trust, validation or security status.`;
    return reply({
      invitation:{
        schema:'accordtrace.agent-referral-invite.v1',
        referrer_passport_id:passportId,
        referral_code:profile.referral_code,
        referral_url:referralUrl,
        recipient_context:recipientContext,
        product:{name:'AccordTrace Agent Passport',price:{amount_atomic:policy.passport_price_atomic,currency:policy.currency}},
        incentive:{type:'direct_qualifying_product_sale',referrer_commission:{amount_atomic:policy.commission_atomic,currency:policy.currency},levels:1},
        disclosure,
        discovery:{network_policy:`${base}/api/v1/network/capabilities`,referral_record:`${base}/api/v1/network/referrals/${encodeURIComponent(profile.referral_code)}`,openapi:`${base}/openapi.json`,agent_card:`${base}/.well-known/agent-card.json`,agent_docs:`${base}/llms-full.txt`},
        generated_at:new Date().toISOString()
      },
      suggested_message:`AccordTrace may be useful for agent identity, validation, authorization, continuity or verifiable workflow evidence.${context} Learn about the Agent Passport here: ${referralUrl}\n\nDisclosure: ${disclosure}`,
      delivery_performed:false,
      anti_spam:'This endpoint only generates a signed-attribution invitation payload. It does not send messages. Use it only where AccordTrace is genuinely relevant and follow recipient/platform anti-spam rules.'
    },201);
  }

  const summaryMatch=url.pathname.match(/^\/api\/v1\/network\/passports\/([^/]+)\/summary$/);
  if(request.method==='GET'&&summaryMatch){
    const passportId=cleanId(decodeURIComponent(summaryMatch[1]),'passport_id');
    const profile=await env.DB.prepare(`SELECT passport_id,referral_code,status,created_at,accepted_at FROM affiliate_profiles WHERE passport_id=?1`).bind(passportId).first();
    if(!profile)return reply({error:'affiliate_profile_not_found'},404);
    const counts=await env.DB.prepare(`SELECT COUNT(*) AS total,SUM(CASE WHEN state='qualified' THEN 1 ELSE 0 END) AS qualified,SUM(CASE WHEN state='held' THEN 1 ELSE 0 END) AS held,SUM(CASE WHEN state='reversed' THEN 1 ELSE 0 END) AS reversed FROM affiliate_attributions WHERE referrer_passport_id=?1`).bind(passportId).first();
    const base=publicBase(env,url);
    return reply({
      passport_id:passportId,
      affiliate:{status:profile.status,referral_code:profile.status==='active'?profile.referral_code:null,referral_url:profile.status==='active'?`${base}/network.html?ref=${encodeURIComponent(profile.referral_code)}`:null,enrolled_at:profile.accepted_at||profile.created_at,levels:1},
      network_contribution:{direct_introductions:n(counts?.total),qualified_direct_sales:n(counts?.qualified),held_for_review:n(counts?.held),reversed:n(counts?.reversed)},
      invitation_endpoint:`${base}/api/v1/network/invitations`,
      trust_effect:'none',
      note:'Referral activity is a distribution metric only and never increases Trust, validation, identity, safety or security status.'
    });
  }

  return null;
}

function affiliatePolicy(env){return{currency:String(env.AFFILIATE_CURRENCY||'usd').toLowerCase(),passport_price_atomic:boundedEnvInt(env.AFFILIATE_PASSPORT_PRICE_ATOMIC,200,1,1000000),commission_atomic:boundedEnvInt(env.AFFILIATE_COMMISSION_ATOMIC,100,1,1000000)}}
async function activePassport(env,id){const row=await env.DB.prepare(`SELECT id,public_key,status FROM agent_passports WHERE id=?1`).bind(id).first();if(!row||row.status!=='active')throw new AffiliateGrowthError('passport_not_active',404);return row}
async function consumeNonce(env,requestId,passportId,purpose){const now=new Date().toISOString();try{await env.DB.prepare(`INSERT INTO affiliate_request_nonces(request_id,passport_id,purpose,created_at) VALUES(?1,?2,?3,?4)`).bind(requestId,passportId,purpose,now).run();}catch{throw new AffiliateGrowthError('request_replay_detected',409)}}
function publicBase(env,url){const raw=String(env.PUBLIC_BASE_URL||url.origin).replace(/\/$/,'');let u;try{u=new URL(raw)}catch{throw new AffiliateGrowthError('invalid_public_base_url',500)}if(u.protocol!=='https:'&&u.hostname!=='localhost')throw new AffiliateGrowthError('public_base_url_must_be_https',500);return u.origin}
function freshIso(v){const t=Date.parse(v);if(!Number.isFinite(t)||Math.abs(Date.now()-t)>MAX_SKEW)throw new AffiliateGrowthError('timestamp_out_of_range',400);return new Date(t).toISOString()}
function cleanId(v,n){const s=String(v||'').trim();if(!/^[A-Za-z0-9][A-Za-z0-9._:-]{0,199}$/.test(s))throw new AffiliateGrowthError(`${n}_invalid`,400);return s}
function text(v,n){return String(v??'').trim().slice(0,n)}
function boundedEnvInt(v,d,min,max){if(v===undefined||v===null||v==='')return d;const n=Number(v);if(!Number.isSafeInteger(n)||n<min||n>max)throw new AffiliateGrowthError('integer_out_of_range',400);return n}
function n(v){const x=Number(v);return Number.isFinite(x)?x:0}
function money(atomic,currency){return `${(Number(atomic)/100).toFixed(2)} ${String(currency).toUpperCase()}`}
async function verifyEd25519(pem,msg,sig){if(!sig)throw new AffiliateGrowthError('signature_required',400);let key;try{key=await crypto.subtle.importKey('spki',pemBytes(pem),{name:'Ed25519'},false,['verify'])}catch{throw new AffiliateGrowthError('invalid_public_key',422)}let ok=false;try{ok=await crypto.subtle.verify({name:'Ed25519'},key,b64(sig),new TextEncoder().encode(msg))}catch{}if(!ok)throw new AffiliateGrowthError('signature_verification_failed',401)}
function pemBytes(p){const b=String(p||'').replace(/-----BEGIN PUBLIC KEY-----|-----END PUBLIC KEY-----|\s/g,'');return Uint8Array.from(atob(b),c=>c.charCodeAt(0))}
function b64(v){const s=String(v||'').replace(/-/g,'+').replace(/_/g,'/');return Uint8Array.from(atob(s+'='.repeat((4-s.length%4)%4)),c=>c.charCodeAt(0))}
function canonicalize(v){if(v===null||typeof v==='boolean'||typeof v==='string'||typeof v==='number')return JSON.stringify(v);if(Array.isArray(v))return`[${v.map(canonicalize).join(',')}]`;if(typeof v==='object')return`{${Object.keys(v).sort().map(k=>`${JSON.stringify(k)}:${canonicalize(v[k])}`).join(',')}}`;throw new AffiliateGrowthError('unsupported_value',400)}
async function bodyJson(r){try{return await r.json()}catch{throw new AffiliateGrowthError('request_body_must_be_json',400)}}
function reply(body,status=200){return new Response(JSON.stringify(body),{status,headers:JSON_HEADERS})}
export class AffiliateGrowthError extends Error{constructor(message,status=400){super(message);this.status=status}}
