import { passportSafeEnv, passportSignerState } from './passport-signer-readiness.js';

const JSON_HEADERS={"content-type":"application/json; charset=utf-8"};
const CAMPAIGN='founding_1000_202609';
const CAMPAIGN_NAME='Founding 1000';
const LIMIT=1000;
const PRODUCT_ID='agent_passport_certificate';
const PRODUCT_VERSION='1';
const CLAIM_DOMAIN='accordtrace.passport-product.founding-1000.claim.v1';
const MAX_SKEW=10*60*1000;

export async function handleFounding1000(request,env,url=new URL(request.url)){
  const base='/api/v1/passport-product/founding-1000';
  if(!url.pathname.startsWith(base))return null;
  env=await passportSafeEnv(env);
  await releaseStaleReservations(env);

  if(request.method==='GET'&&url.pathname===base){
    const counts=await campaignCounts(env);
    const signer=passportSignerState(env);
    const enabled=campaignEnabled(env);
    const standard=standardPrice(env);
    return reply({
      service:'AccordTrace Founding 1000',
      version:'0.1.0',
      campaign:{id:CAMPAIGN,name:CAMPAIGN_NAME,limit:LIMIT,issued:counts.issued,reserved:counts.reserved,claimed:counts.issued+counts.reserved,available:counts.available},
      offer:{certificate_price:{amount_atomic:0,currency:standard.currency},standard_price_after_campaign:standard,card_required:false,referral_commission_for_free_grant:{amount_atomic:0,currency:standard.currency}},
      eligibility:{active_cryptographic_passport_required:true,passport_signature_required:true,one_grant_per_passport:true,unique_human_or_company_claim:false},
      claim_enabled:enabled&&signer.valid&&counts.available>0,
      campaign_enabled:enabled,
      certificate_signer:signer,
      claim:{method:'POST',url:`${publicBase(env,url)}${base}`,domain:CLAIM_DOMAIN},
      economic_boundary:'A Founding 1000 Certificate is a promotional grant with no payment and no direct-referral commission. It is never counted as a paid sale or revenue.',
      identity_boundary:'One grant per active cryptographic Passport key is an anti-duplicate control, not proof of one unique human, company, owner or legal identity.',
      certificate_scope:'AccordTrace-signed issuance bound to cryptographic Passport key control; not legal identity, KYC, Trust, safety or validation.'
    });
  }

  if(request.method==='POST'&&url.pathname===`${base}/claim`){
    if(!campaignEnabled(env))return reply({error:'founding_1000_disabled'},503);
    const signer=passportSignerState(env);
    if(!signer.valid)return reply({error:'certificate_signing_not_ready',certificate_signer:signer},503);
    const body=await bodyJson(request);
    const passportId=cleanId(body.passport_id,'passport_id');
    const requestId=cleanId(body.request_id,'request_id');
    const requestedAt=freshIso(body.requested_at);
    const passport=await activePassport(env,passportId);
    const payload={domain:CLAIM_DOMAIN,campaign:CAMPAIGN,passport_id:passportId,request_id:requestId,requested_at:requestedAt};
    await verifyEd25519(passport.public_key,canonicalize(payload),body.signature);

    const existingCertificate=await initialCertificate(env,passportId);
    if(existingCertificate){
      const founding=await env.DB.prepare(`SELECT slot,state FROM passport_founding_slots WHERE campaign=?1 AND certificate_id=?2 LIMIT 1`).bind(CAMPAIGN,existingCertificate.id).first();
      if(founding)return foundingResponse(existingCertificate,founding,true,url,env);
      return reply({error:'passport_certificate_already_issued',certificate:{id:existingCertificate.id,state:existingCertificate.state,issued_at:existingCertificate.issued_at},founding_slot_consumed:false},409);
    }

    let slot=await env.DB.prepare(`SELECT * FROM passport_founding_slots WHERE campaign=?1 AND request_id=?2 LIMIT 1`).bind(CAMPAIGN,requestId).first();
    if(slot&&slot.passport_id!==passportId)return reply({error:'founding_request_replay_mismatch'},409);
    if(!slot)slot=await env.DB.prepare(`SELECT * FROM passport_founding_slots WHERE campaign=?1 AND passport_id=?2 LIMIT 1`).bind(CAMPAIGN,passportId).first();

    if(!slot){
      const openOrder=await env.DB.prepare(`SELECT id,payment_status,fulfillment_source FROM passport_product_orders WHERE passport_id=?1 AND product_id=?2 AND product_version=?3 AND payment_status IN ('created','pending','paid','review','fulfilled') ORDER BY created_at DESC LIMIT 1`).bind(passportId,PRODUCT_ID,PRODUCT_VERSION).first();
      if(openOrder)return reply({error:'passport_certificate_order_already_open',order:openOrder,founding_slot_consumed:false},409);
      const now=new Date().toISOString();
      try{
        const result=await env.DB.prepare(`UPDATE passport_founding_slots SET passport_id=?1,request_id=?2,state='reserved',claimed_at=?3 WHERE campaign=?4 AND slot=(SELECT slot FROM passport_founding_slots WHERE campaign=?4 AND state='available' ORDER BY slot LIMIT 1) AND state='available'`).bind(passportId,requestId,now,CAMPAIGN).run();
        if(Number(result.meta?.changes??0)===0){
          slot=await env.DB.prepare(`SELECT * FROM passport_founding_slots WHERE campaign=?1 AND (passport_id=?2 OR request_id=?3) ORDER BY slot LIMIT 1`).bind(CAMPAIGN,passportId,requestId).first();
          if(!slot){const counts=await campaignCounts(env);return reply({error:'founding_1000_full',campaign:{id:CAMPAIGN,limit:LIMIT,issued:counts.issued,reserved:counts.reserved,available:counts.available},next_offer:{amount_atomic:standardPrice(env).amount_atomic,currency:standardPrice(env).currency}},409);}
        }
      }catch(error){
        slot=await env.DB.prepare(`SELECT * FROM passport_founding_slots WHERE campaign=?1 AND (passport_id=?2 OR request_id=?3) ORDER BY slot LIMIT 1`).bind(CAMPAIGN,passportId,requestId).first();
        if(!slot)throw error;
      }
    }

    if(slot.passport_id!==passportId)return reply({error:'founding_slot_passport_mismatch'},409);
    if(slot.state==='issued'&&slot.certificate_id){
      const certificate=await certificateById(env,slot.certificate_id);
      if(!certificate)throw new Founding1000Error('founding_certificate_record_missing',500);
      return foundingResponse(certificate,slot,true,url,env);
    }

    // A paid issuance can race the short interval between eligibility and slot reservation.
    // Never overwrite it or count it as a Founding grant; release an unused reservation.
    const racedCertificate=await initialCertificate(env,passportId);
    if(racedCertificate){
      await releaseUnusedSlot(env,slot,passportId);
      return reply({error:'passport_certificate_already_issued',certificate:{id:racedCertificate.id,state:racedCertificate.state,issued_at:racedCertificate.issued_at},founding_slot_consumed:false},409);
    }

    const issued=await issueReservedSlot(env,slot,passport,url);
    await recordAggregateIssued(env);
    return foundingResponse(issued.certificate,issued.slot,false,url,env,201);
  }

  return reply({error:'not_found'},404);
}

async function issueReservedSlot(env,slot,passport,url){
  if(slot.order_id||slot.certificate_id){
    const refreshed=await env.DB.prepare(`SELECT * FROM passport_founding_slots WHERE campaign=?1 AND slot=?2`).bind(CAMPAIGN,slot.slot).first();
    if(refreshed?.certificate_id){const certificate=await certificateById(env,refreshed.certificate_id);if(certificate)return{certificate,slot:refreshed};}
    throw new Founding1000Error('founding_reservation_requires_repair',409);
  }
  const now=new Date().toISOString();
  const orderId=`atpo_${randomHex(16)}`;
  const certificate=await buildCertificate(env,passport,slot.slot,url,now);
  const checkoutRequestId=`founding:${slot.request_id}`;
  const statements=[
    env.DB.prepare(`INSERT INTO passport_product_orders(id,checkout_request_id,passport_id,product_id,product_version,referral_attribution_id,referral_code,payment_status,amount_total,currency,created_at,fulfilled_at,updated_at,fulfillment_source,campaign) VALUES(?1,?2,?3,?4,?5,NULL,NULL,'fulfilled',0,?6,?7,?7,?7,'founding_grant',?8)`).bind(orderId,checkoutRequestId,passport.id,PRODUCT_ID,PRODUCT_VERSION,standardPrice(env).currency,now,CAMPAIGN),
    env.DB.prepare(`INSERT INTO agent_passport_certificates(id,order_id,passport_id,product_id,product_version,public_key_fingerprint,state,certificate_json,issued_at,updated_at,issuance_tier,founding_ordinal) VALUES(?1,?2,?3,?4,?5,?6,'active',?7,?8,?8,'founding',?9)`).bind(certificate.id,orderId,passport.id,PRODUCT_ID,PRODUCT_VERSION,certificate.public_key_fingerprint,JSON.stringify(certificate),now,slot.slot),
    env.DB.prepare(`UPDATE passport_founding_slots SET order_id=?1,certificate_id=?2,state='issued',issued_at=?3 WHERE campaign=?4 AND slot=?5 AND passport_id=?6 AND state='reserved' AND order_id IS NULL AND certificate_id IS NULL`).bind(orderId,certificate.id,now,CAMPAIGN,slot.slot,passport.id)
  ];
  try{
    if(typeof env.DB.batch==='function')await env.DB.batch(statements);
    else for(const statement of statements)await statement.run();
  }catch(error){
    const refreshed=await env.DB.prepare(`SELECT * FROM passport_founding_slots WHERE campaign=?1 AND slot=?2`).bind(CAMPAIGN,slot.slot).first();
    if(refreshed?.certificate_id){const raced=await certificateById(env,refreshed.certificate_id);if(raced)return{certificate:raced,slot:refreshed};}
    throw error;
  }
  const refreshed=await env.DB.prepare(`SELECT * FROM passport_founding_slots WHERE campaign=?1 AND slot=?2`).bind(CAMPAIGN,slot.slot).first();
  if(!refreshed||refreshed.state!=='issued'||refreshed.certificate_id!==certificate.id)throw new Founding1000Error('founding_issuance_state_conflict',409);
  return{certificate,slot:refreshed};
}

async function buildCertificate(env,passport,ordinal,url,issuedAt){
  if(!env.NOTARY_PRIVATE_JWK)throw new Founding1000Error('certificate_signing_not_configured',503);
  const standard=standardPrice(env);
  const id=`atpc_${randomHex(16)}`;
  const base=publicBase(env,url);
  const publicKeyFingerprint=await sha256Hex(pemBytes(passport.public_key));
  const unsigned={
    schema:'accordtrace.agent-passport-certificate.v1',
    id,
    passport_id:passport.id,
    public_key_fingerprint:`sha256:${publicKeyFingerprint}`,
    product:{id:PRODUCT_ID,version:PRODUCT_VERSION,price_at_issue:{amount_atomic:0,currency:standard.currency},standard_price_after_campaign:standard},
    issuance:{tier:'founding',campaign:CAMPAIGN,campaign_name:CAMPAIGN_NAME,founding_ordinal:Number(ordinal),consideration:'promotional_grant_no_payment'},
    issued_at:issuedAt,
    certificate_url:`${base}/api/v1/passport-product/certificates/${encodeURIComponent(id)}`,
    verification_endpoint:`${base}/api/v1/passport-product/certificates/verify`,
    scope:'AccordTrace issuance bound to cryptographic Passport key control; not legal identity, KYC, Trust, safety or validation.'
  };
  const privateJwk=JSON.parse(env.NOTARY_PRIVATE_JWK);
  const privateKey=await crypto.subtle.importKey('jwk',privateJwk,{name:'Ed25519'},false,['sign']);
  const signature=await crypto.subtle.sign('Ed25519',privateKey,new TextEncoder().encode(canonicalize(unsigned)));
  const issuerPublicKey=await issuerPublicPem(privateJwk);
  return{...unsigned,issuer:{name:'AccordTrace',algorithm:'Ed25519',public_key:issuerPublicKey,signature:base64url(new Uint8Array(signature))}};
}

async function campaignCounts(env){
  const rows=await env.DB.prepare(`SELECT state,COUNT(*) AS count FROM passport_founding_slots WHERE campaign=?1 GROUP BY state`).bind(CAMPAIGN).all();
  const counts={available:0,reserved:0,issued:0};
  for(const row of rows.results||[])if(Object.hasOwn(counts,row.state))counts[row.state]=Number(row.count)||0;
  return counts;
}
async function releaseStaleReservations(env){
  try{await env.DB.prepare(`UPDATE passport_founding_slots SET passport_id=NULL,request_id=NULL,state='available',claimed_at=NULL WHERE campaign=?1 AND state='reserved' AND order_id IS NULL AND certificate_id IS NULL AND claimed_at IS NOT NULL AND julianday(claimed_at)<julianday('now','-1 hour')`).bind(CAMPAIGN).run();}catch{}
}
async function releaseUnusedSlot(env,slot,passportId){
  if(slot.order_id||slot.certificate_id)return;
  await env.DB.prepare(`UPDATE passport_founding_slots SET passport_id=NULL,request_id=NULL,state='available',claimed_at=NULL WHERE campaign=?1 AND slot=?2 AND passport_id=?3 AND state='reserved' AND order_id IS NULL AND certificate_id IS NULL`).bind(CAMPAIGN,slot.slot,passportId).run();
}
async function recordAggregateIssued(env){
  try{await env.DB.prepare(`INSERT INTO campaign_daily(day,campaign,channel,medium,event,count) VALUES(date('now'),?1,'product','agent_api','founding_certificate_issued',1) ON CONFLICT(day,campaign,channel,medium,event) DO UPDATE SET count=count+1`).bind(CAMPAIGN).run();}catch{}
}
async function activePassport(env,id){
  const row=await env.DB.prepare(`SELECT id,public_key,status FROM agent_passports WHERE id=?1`).bind(id).first();
  if(!row||row.status!=='active')throw new Founding1000Error('passport_not_active',404);
  return row;
}
async function initialCertificate(env,passportId){return env.DB.prepare(`SELECT id,state,issued_at,issuance_tier,founding_ordinal,certificate_json FROM agent_passport_certificates WHERE passport_id=?1 AND product_id=?2 AND product_version=?3 ORDER BY issued_at DESC LIMIT 1`).bind(passportId,PRODUCT_ID,PRODUCT_VERSION).first()}
async function certificateById(env,id){return env.DB.prepare(`SELECT id,state,issued_at,issuance_tier,founding_ordinal,certificate_json FROM agent_passport_certificates WHERE id=?1`).bind(id).first()}
function foundingResponse(row,slot,idempotent,url,env,status=200){
  const certificate=row.certificate_json?JSON.parse(row.certificate_json):row;
  return reply({
    campaign:{id:CAMPAIGN,name:CAMPAIGN_NAME,founding_ordinal:Number(slot.slot),limit:LIMIT},
    certificate,
    certificate_url:`${publicBase(env,url)}/api/v1/passport-product/certificates/${encodeURIComponent(certificate.id)}`,
    idempotent:Boolean(idempotent),
    payment:{required:false,amount_atomic:0,currency:standardPrice(env).currency,card_required:false},
    referral:{commission_eligible:false,commission_amount_atomic:0,reason:'promotional_grant_no_paid_sale'},
    boundary:'This Founding grant is a Certificate issuance, not a paid sale, revenue event, unique-human claim, KYC result, Trust score or safety guarantee.'
  },status);
}
function standardPrice(env){return{amount_atomic:envInt(env.PASSPORT_PRODUCT_PRICE_ATOMIC,200,1,1_000_000),currency:String(env.PASSPORT_PRODUCT_CURRENCY||'usd').toLowerCase()}}
function campaignEnabled(env){return String(env.FOUNDING_1000_ENABLED??'true').toLowerCase()!=='false'}
function freshIso(value){const t=Date.parse(value);if(!Number.isFinite(t)||Math.abs(Date.now()-t)>MAX_SKEW)throw new Founding1000Error('timestamp_out_of_range',400);return new Date(t).toISOString()}
function cleanId(value,name){const s=String(value||'').trim();if(!/^[A-Za-z0-9][A-Za-z0-9._:-]{0,199}$/.test(s))throw new Founding1000Error(`${name}_invalid`,400);return s}
async function bodyJson(request){try{const body=await request.json();if(!body||typeof body!=='object'||Array.isArray(body))throw new Error();return body}catch{throw new Founding1000Error('request_body_must_be_json',400)}}
async function verifyEd25519(pem,message,signature){
  if(!signature)throw new Founding1000Error('signature_required',400);
  let key;try{key=await crypto.subtle.importKey('spki',pemBytes(pem),{name:'Ed25519'},false,['verify'])}catch{throw new Founding1000Error('invalid_public_key',422)}
  let ok=false;try{ok=await crypto.subtle.verify('Ed25519',key,fromBase64url(signature),new TextEncoder().encode(message))}catch{}
  if(!ok)throw new Founding1000Error('signature_verification_failed',401);
}
function publicBase(env,url){const raw=String(env.PUBLIC_BASE_URL||url.origin).replace(/\/$/,'');let parsed;try{parsed=new URL(raw)}catch{throw new Founding1000Error('invalid_public_base_url',500)}if(parsed.protocol!=='https:'&&parsed.hostname!=='localhost')throw new Founding1000Error('public_base_url_must_be_https',500);return parsed.origin}
async function issuerPublicPem(privateJwk){if(!privateJwk?.x)throw new Founding1000Error('issuer_public_key_unavailable',503);const publicJwk={kty:'OKP',crv:'Ed25519',x:privateJwk.x,ext:true};const key=await crypto.subtle.importKey('jwk',publicJwk,{name:'Ed25519'},true,['verify']);const spki=new Uint8Array(await crypto.subtle.exportKey('spki',key));const b64=bytesToBase64(spki);return`-----BEGIN PUBLIC KEY-----\n${b64.match(/.{1,64}/g).join('\n')}\n-----END PUBLIC KEY-----`}
function canonicalize(value){if(value===null||typeof value==='boolean'||typeof value==='string'||typeof value==='number')return JSON.stringify(value);if(Array.isArray(value))return`[${value.map(canonicalize).join(',')}]`;if(typeof value==='object')return`{${Object.keys(value).sort().map(key=>`${JSON.stringify(key)}:${canonicalize(value[key])}`).join(',')}}`;throw new Founding1000Error('unsupported_value',400)}
async function sha256Hex(value){const bytes=value instanceof Uint8Array?value:new TextEncoder().encode(String(value));const digest=await crypto.subtle.digest('SHA-256',bytes);return[...new Uint8Array(digest)].map(x=>x.toString(16).padStart(2,'0')).join('')}
function pemBytes(pem){const b=String(pem||'').replace(/-----BEGIN PUBLIC KEY-----|-----END PUBLIC KEY-----|\s/g,'');return base64ToBytes(b)}
function bytesToBase64(bytes){let s='';for(const b of bytes)s+=String.fromCharCode(b);return btoa(s)}
function base64ToBytes(value){const s=atob(String(value||''));return Uint8Array.from(s,c=>c.charCodeAt(0))}
function base64url(bytes){return bytesToBase64(bytes).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'')}
function fromBase64url(value){const s=String(value||'').replace(/-/g,'+').replace(/_/g,'/');return base64ToBytes(s+'='.repeat((4-s.length%4)%4))}
function envInt(value,fallback,min,max){if(value===undefined||value===null||value==='')return fallback;const n=Number(value);if(!Number.isSafeInteger(n)||n<min||n>max)throw new Founding1000Error('integer_out_of_range',500);return n}
function randomHex(length){const bytes=crypto.getRandomValues(new Uint8Array(length));return[...bytes].map(x=>x.toString(16).padStart(2,'0')).join('')}
function reply(body,status=200){return new Response(JSON.stringify(body),{status,headers:JSON_HEADERS})}
export class Founding1000Error extends Error{constructor(message,status=400){super(message);this.status=status}}
