import { createPaymentAdapter, PaymentAdapterError } from "./payment-adapters/index.js";

const JSON_HEADERS={"content-type":"application/json; charset=utf-8"};
const MAX_CLOCK_SKEW_MS=10*60*1000;
const SUPPORT_CACHE_MS=5*60*1000;
let schemaReady=false;

export async function handlePaymentHardening(request,env,url=new URL(request.url)){
  if(!url.pathname.startsWith('/api/v1/payments/'))return null;
  await ensureSchema(env);

  if(request.method==='GET'&&url.pathname==='/api/v1/payments/capabilities'){
    const enabled=isVerifyEnabled(env); const facilitatorConfigured=Boolean(validFacilitatorUrl(env.X402_FACILITATOR_URL,false));
    return reply({service:'AccordTrace Non-Custodial Payments',version:'0.2.0',features:['signed_service_offers','signed_buyer_orders','x402_v2_verification','deterministic_payment_requirements','payment_payload_replay_protection','facilitator_supported_preflight','payer_reference_digest','payment_bound_capability_leases','platform_fee_disclosure'],rails:{x402:{verify_enabled:enabled,facilitator_configured:facilitatorConfigured,settlement:'external',network_format:'CAIP-2'}},custody:'none',safety:'AccordTrace never requests wallet seed phrases or private keys and never stores raw x402 payment payloads. Payer references are stored only as digests.'});
  }

  if(request.method==='POST'&&url.pathname==='/api/v1/payments/orders')return createHardenedOrder(request,env);
  if(request.method==='POST'&&url.pathname==='/api/v1/payments/x402/verify')return verifyHardenedOrder(request,env);
  return null;
}

async function createHardenedOrder(request,env){
  const body=await bodyJson(request); const orderId=cleanId(body.order_id,'order_id'); const offerId=cleanId(body.offer_id,'offer_id'); const buyer=await requirePassport(env,body.buyer_passport_id); const leaseId=cleanId(body.lease_id,'lease_id');
  required(body.ordered_at,'ordered_at'); required(body.signature,'signature'); assertFresh(body.ordered_at);
  const offer=await env.DB.prepare(`SELECT * FROM service_offers WHERE id=?1`).bind(offerId).first();
  if(!offer||offer.status!=='active')return reply({error:'offer_not_active'},404);
  const orderedAtMs=Date.parse(body.ordered_at); if(Date.parse(offer.valid_from)>Date.now()||Date.parse(offer.expires_at)<=Date.now())return reply({error:'offer_expired'},409);
  if(!isCaip2Network(offer.network))return reply({error:'x402_v2_network_must_be_caip2'},422);
  if(offer.seller_passport_id===buyer.id)throw new PaymentHardeningError('buyer_and_seller_must_differ',400);
  const lease=await env.DB.prepare(`SELECT id,issuer_passport_id,subject_passport_id,allowed_actions_json,allowed_origins_json,max_calls,status,expires_at FROM capability_leases WHERE id=?1`).bind(leaseId).first();
  if(!lease)return reply({error:'lease_not_found'},404); if(lease.status!=='active')return reply({error:'lease_not_active'},409);
  if(lease.issuer_passport_id!==offer.seller_passport_id||lease.subject_passport_id!==buyer.id)return reply({error:'lease_parties_mismatch'},422);
  if(Number(lease.max_calls)!==1)return reply({error:'paid_lease_must_allow_exactly_one_call'},422);
  if(!parseArray(lease.allowed_actions_json).includes(offer.service_action)||!parseArray(lease.allowed_origins_json).includes(offer.target_origin))return reply({error:'lease_scope_mismatch'},422);
  if(Date.parse(lease.expires_at)>Date.parse(offer.expires_at))return reply({error:'lease_outlives_offer'},422);

  const payload={domain:'accordtrace.payment.service.order.v1',order_id:orderId,offer_id:offer.id,buyer_passport_id:buyer.id,seller_passport_id:offer.seller_passport_id,lease_id:leaseId,rail:offer.rail,network:offer.network,asset:offer.asset,amount_atomic:offer.amount_atomic,platform_fee_atomic:offer.platform_fee_atomic,ordered_at:body.ordered_at};
  await verifyEd25519(buyer.public_key,canonicalize(payload),body.signature);
  const requirements=deterministicRequirements(offer,orderId,orderedAtMs); const requirementsDigest=await sha256(canonicalize(requirements)); const now=new Date().toISOString();
  const statements=[
    env.DB.prepare(`INSERT OR IGNORE INTO service_orders (id,offer_id,buyer_passport_id,seller_passport_id,lease_id,payment_status,buyer_signature,ordered_at,created_at,updated_at) VALUES (?1,?2,?3,?4,?5,'payment_claim',?6,?7,?8,?8)`).bind(orderId,offer.id,buyer.id,offer.seller_passport_id,leaseId,text(body.signature,1000),body.ordered_at,now),
    env.DB.prepare(`INSERT OR IGNORE INTO x402_order_requirements (order_id,requirements_json,requirements_digest,created_at) VALUES (?1,?2,?3,?4)`).bind(orderId,JSON.stringify(requirements),requirementsDigest,now)
  ];
  const results=typeof env.DB.batch==='function'?await env.DB.batch(statements):[await statements[0].run(),await statements[1].run()];
  const orderChanges=results?.[0]?.meta?.changes??1; const reqChanges=results?.[1]?.meta?.changes??1;
  if(orderChanges===0||reqChanges===0)return reply({error:'order_or_lease_already_bound'},409);
  return reply({order:await publicOrder(env,orderId),payment_requirements:requirements,payment_requirements_digest:requirementsDigest,requirements_source:'stored_deterministic'},201);
}

async function verifyHardenedOrder(request,env){
  if(!isVerifyEnabled(env))throw new PaymentHardeningError('x402_verification_disabled',503);
  const facilitator=validFacilitatorUrl(env.X402_FACILITATOR_URL,true);
  const body=await bodyJson(request); const orderId=cleanId(body.order_id,'order_id'); const buyer=await requirePassport(env,body.buyer_passport_id); const order=await env.DB.prepare(`SELECT * FROM service_orders WHERE id=?1`).bind(orderId).first();
  if(!order)return reply({error:'order_not_found'},404); if(order.buyer_passport_id!==buyer.id)return reply({error:'buyer_mismatch'},403); if(!['payment_claim','rejected'].includes(order.payment_status))return reply({error:'order_not_verifiable_in_current_state'},409);
  required(body.verified_at,'verified_at'); required(body.signature,'signature'); assertFresh(body.verified_at);
  const offer=await env.DB.prepare(`SELECT * FROM service_offers WHERE id=?1`).bind(order.offer_id).first(); if(!offer||offer.status!=='active'||Date.parse(offer.expires_at)<=Date.now())return reply({error:'offer_not_active'},409);
  const stored=await env.DB.prepare(`SELECT requirements_json,requirements_digest FROM x402_order_requirements WHERE order_id=?1`).bind(order.id).first();
  if(!stored)return reply({error:'order_requires_hardened_payment_requirements'},409);
  const requirements=safeJson(stored.requirements_json); if(!requirements)return reply({error:'stored_payment_requirements_invalid'},500);
  const recalculated=await sha256(canonicalize(requirements)); if(recalculated!==stored.requirements_digest)return reply({error:'stored_payment_requirements_digest_mismatch'},500);
  const paymentPayload=body.payment_payload; if(!paymentPayload||typeof paymentPayload!=='object'||Array.isArray(paymentPayload))throw new PaymentHardeningError('payment_payload_must_be_object',400);
  const paymentPayloadDigest=await sha256(canonicalize(paymentPayload));
  const signedPayload={domain:'accordtrace.payment.x402.verify.v1',order_id:order.id,buyer_passport_id:buyer.id,payment_payload_digest:paymentPayloadDigest,payment_requirements_digest:stored.requirements_digest,verified_at:body.verified_at};
  await verifyEd25519(buyer.public_key,canonicalize(signedPayload),body.signature);
  const replay=await env.DB.prepare(`SELECT order_id FROM x402_payment_payload_replays WHERE payment_payload_digest=?1`).bind(paymentPayloadDigest).first();
  if(replay&&replay.order_id!==order.id)return reply({error:'payment_payload_replay_detected'},409);
  if(!replay)await env.DB.prepare(`INSERT INTO x402_payment_payload_replays (payment_payload_digest,order_id,first_seen_at) VALUES (?1,?2,?3)`).bind(paymentPayloadDigest,order.id,new Date().toISOString()).run();

  await assertFacilitatorSupport(env,facilitator,requirements.scheme,requirements.network);
  let verification; try{verification=await createPaymentAdapter({...env,X402_FACILITATOR_URL:facilitator},'x402').verify({paymentPayload,paymentRequirements:requirements,paymentHeaderDigest:paymentPayloadDigest});}
  catch(error){if(error instanceof PaymentAdapterError)throw new PaymentHardeningError(error.message,error.status,error.details);throw error;}
  const status=verification.valid?'payment_authorized':'rejected'; const payerDigest=verification.payer?await sha256(`accordtrace.x402.payer.v1:${verification.payer}`):null; const now=new Date().toISOString();
  await env.DB.prepare(`UPDATE service_orders SET payment_status=?1,payment_payload_digest=?2,payment_requirements_digest=?3,payment_reference_digest=?4,facilitator=?5,payer_ref=NULL,authorized_at=?6,updated_at=?7 WHERE id=?8`).bind(status,paymentPayloadDigest,stored.requirements_digest,payerDigest,facilitator,verification.valid?body.verified_at:null,now,order.id).run();
  return reply({order:await publicOrder(env,order.id),verification:{valid:Boolean(verification.valid),rail:'x402',invalid_reason:verification.invalid_reason||null,settlement_status:'not_settled_by_accordtrace',custody:'none',payer_reference:'digest_only'},replay_protection:{payment_payload_digest_reserved:true,scope:'cross_order'}},verification.valid?200:402);
}

async function assertFacilitatorSupport(env,facilitator,scheme,network){
  const digest=await sha256(facilitator); const now=Date.now(); const cached=await env.DB.prepare(`SELECT supported,expires_at FROM x402_facilitator_support_cache WHERE facilitator_digest=?1 AND scheme=?2 AND network=?3 AND x402_version=2`).bind(digest,scheme,network).first();
  if(cached&&Date.parse(cached.expires_at)>now){if(Number(cached.supported)===1)return;throw new PaymentHardeningError('x402_facilitator_does_not_support_requirements',503);}
  let response,data; try{response=await fetch(`${facilitator}/supported`,{method:'GET',headers:{accept:'application/json'},redirect:'error',signal:AbortSignal.timeout(5000)});data=await response.json();}catch{throw new PaymentHardeningError('x402_facilitator_supported_check_failed',502);}
  if(!response.ok||!data||!Array.isArray(data.kinds))throw new PaymentHardeningError('x402_facilitator_supported_check_failed',502);
  const supported=data.kinds.some(k=>Number(k?.x402Version)===2&&k?.scheme===scheme&&k?.network===network); const checkedAt=new Date().toISOString(); const expiresAt=new Date(now+SUPPORT_CACHE_MS).toISOString(); const responseDigest=await sha256(canonicalize({kinds:data.kinds.map(k=>({x402Version:k?.x402Version,scheme:k?.scheme,network:k?.network}))}));
  await env.DB.prepare(`INSERT INTO x402_facilitator_support_cache (facilitator_digest,scheme,network,x402_version,supported,checked_at,expires_at,response_digest) VALUES (?1,?2,?3,2,?4,?5,?6,?7) ON CONFLICT(facilitator_digest,scheme,network,x402_version) DO UPDATE SET supported=excluded.supported,checked_at=excluded.checked_at,expires_at=excluded.expires_at,response_digest=excluded.response_digest`).bind(digest,scheme,network,supported?1:0,checkedAt,expiresAt,responseDigest).run();
  if(!supported)throw new PaymentHardeningError('x402_facilitator_does_not_support_requirements',503);
}

function deterministicRequirements(offer,orderId,orderedAtMs){const delta=Math.floor((Date.parse(offer.expires_at)-orderedAtMs)/1000);if(delta<=0)throw new PaymentHardeningError('offer_expired_for_order',409);return{scheme:'exact',network:offer.network,amount:offer.amount_atomic,asset:offer.asset,payTo:offer.pay_to,maxTimeoutSeconds:Math.max(1,Math.min(3600,delta)),extra:{accordTraceOrderId:orderId,platformFeeAtomic:offer.platform_fee_atomic}};}
async function publicOrder(env,id){const r=await env.DB.prepare(`SELECT id,offer_id,buyer_passport_id,seller_passport_id,lease_id,payment_status,payment_payload_digest,payment_requirements_digest,payment_reference_digest,facilitator,ordered_at,authorized_at,consumed_at,created_at,updated_at FROM service_orders WHERE id=?1`).bind(id).first();return r||null;}
async function requirePassport(env,id){required(id,'passport_id');const p=await env.DB.prepare(`SELECT id,public_key,status FROM agent_passports WHERE id=?1`).bind(id).first();if(!p)throw new PaymentHardeningError('passport_not_found',404);if(p.status!=='active')throw new PaymentHardeningError('passport_not_active',403);return p;}
async function ensureSchema(env){if(schemaReady)return;const sql=[`CREATE TABLE IF NOT EXISTS x402_order_requirements (order_id TEXT PRIMARY KEY,requirements_json TEXT NOT NULL,requirements_digest TEXT NOT NULL,created_at TEXT NOT NULL)`,`CREATE TABLE IF NOT EXISTS x402_payment_payload_replays (payment_payload_digest TEXT PRIMARY KEY,order_id TEXT NOT NULL,first_seen_at TEXT NOT NULL)`,`CREATE TABLE IF NOT EXISTS x402_facilitator_support_cache (facilitator_digest TEXT NOT NULL,scheme TEXT NOT NULL,network TEXT NOT NULL,x402_version INTEGER NOT NULL,supported INTEGER NOT NULL,checked_at TEXT NOT NULL,expires_at TEXT NOT NULL,response_digest TEXT,PRIMARY KEY (facilitator_digest,scheme,network,x402_version))`];if(typeof env.DB.batch==='function')await env.DB.batch(sql.map(s=>env.DB.prepare(s)));else for(const s of sql)await env.DB.prepare(s).run();schemaReady=true;}
function validFacilitatorUrl(value,requiredValue){if(!value){if(requiredValue)throw new PaymentHardeningError('x402_facilitator_url_required',503);return null;}try{const u=new URL(String(value));if(u.protocol!=='https:'||u.username||u.password)throw new Error();return u.href.replace(/\/$/,'');}catch{throw new PaymentHardeningError('invalid_x402_facilitator_url',500);}}
function isVerifyEnabled(env){return String(env.X402_VERIFY_ENABLED??'false').toLowerCase()==='true';}
function isCaip2Network(v){return /^[a-z0-9][a-z0-9-]{0,31}:[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/.test(String(v||''));}
function parseArray(v){try{const a=JSON.parse(v);return Array.isArray(a)?a:[];}catch{return[];}}
function cleanId(v,name){const s=String(v??'').trim();if(!/^[A-Za-z0-9][A-Za-z0-9._:-]{0,199}$/.test(s))throw new PaymentHardeningError(`${name}_invalid`,400);return s;}
function text(v,n){return String(v??'').trim().slice(0,n);} function required(v,n){if(!String(v??'').trim())throw new PaymentHardeningError(`${n}_required`,400);} function safeJson(v){if(!v)return null;if(typeof v==='object')return v;try{return JSON.parse(v);}catch{return null;}}
function assertFresh(v){const t=Date.parse(v);if(!Number.isFinite(t)||Math.abs(Date.now()-t)>MAX_CLOCK_SKEW_MS)throw new PaymentHardeningError('timestamp_out_of_range',400);}
async function bodyJson(r){try{return await r.json();}catch{throw new PaymentHardeningError('request_body_must_be_json',400);}}
async function sha256(v){const b=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(String(v)));return[...new Uint8Array(b)].map(x=>x.toString(16).padStart(2,'0')).join('');}
async function verifyEd25519(pem,message,signature){let key;try{key=await crypto.subtle.importKey('spki',pemBytes(pem),{name:'Ed25519'},false,['verify']);}catch{throw new PaymentHardeningError('invalid_public_key',422);}let ok=false;try{ok=await crypto.subtle.verify({name:'Ed25519'},key,b64(signature),new TextEncoder().encode(message));}catch{}if(!ok)throw new PaymentHardeningError('signature_verification_failed',401);}
function pemBytes(p){const b=String(p||'').replace(/-----BEGIN PUBLIC KEY-----|-----END PUBLIC KEY-----|\s/g,'');return Uint8Array.from(atob(b),c=>c.charCodeAt(0));} function b64(v){const n=String(v||'').replace(/-/g,'+').replace(/_/g,'/');return Uint8Array.from(atob(n+'='.repeat((4-n.length%4)%4)),c=>c.charCodeAt(0));}
function canonicalize(v){if(v===null||typeof v==='boolean'||typeof v==='string'||typeof v==='number')return JSON.stringify(v);if(Array.isArray(v))return`[${v.map(canonicalize).join(',')}]`;if(typeof v==='object')return`{${Object.keys(v).sort().map(k=>`${JSON.stringify(k)}:${canonicalize(v[k])}`).join(',')}}`;throw new PaymentHardeningError('unsupported_value',400);}
function reply(body,status=200){return new Response(JSON.stringify(body),{status,headers:JSON_HEADERS});}
export class PaymentHardeningError extends Error{constructor(message,status=400,details=null){super(message);this.status=status;this.details=details;}}
