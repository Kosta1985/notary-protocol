const JSON_HEADERS={"content-type":"application/json; charset=utf-8"};
const MAX_SKEW=10*60*1000;
const TYPES=['domain_control','security_assessment','publisher_validation'];
const OUTCOMES=['passed','failed','inconclusive'];
let schemaReady=false;

export async function handleValidation(request,env,url=new URL(request.url)){
  if(!url.pathname.startsWith('/api/v1/validation/'))return null;
  await ensureSchema(env);

  if(request.method==='GET'&&url.pathname==='/api/v1/validation/capabilities'){
    return reply({
      service:'AccordTrace Validation Marketplace',version:'0.1.0',
      features:['paid_validation_products','passport_bound_requests','payment_authorization_binding','validator_signed_results','public_validation_evidence','no_paid_trust_score'],
      validation_types:TYPES,
      outcomes:OUTCOMES,
      trust_score:null,
      commercial_boundary:'Payment buys an assessment, never a positive result.',
      custody:'none'
    });
  }

  if(request.method==='GET'&&url.pathname==='/api/v1/validation/products'){
    const type=url.searchParams.get('type');
    const base=`SELECT p.*,o.rail,o.network,o.asset,o.amount_atomic,o.platform_fee_atomic,o.expires_at AS offer_expires_at FROM validation_products p JOIN service_offers o ON o.id=p.payment_offer_id WHERE p.status='active' AND o.status='active' AND o.expires_at>?1`;
    const now=new Date().toISOString();
    const rows=type&&TYPES.includes(type)
      ?await env.DB.prepare(`${base} AND p.validation_type=?2 ORDER BY p.created_at DESC LIMIT 100`).bind(now,type).all()
      :await env.DB.prepare(`${base} ORDER BY p.created_at DESC LIMIT 100`).bind(now).all();
    return reply({products:(rows.results||[]).map(productView)});
  }

  if(request.method==='POST'&&url.pathname==='/api/v1/validation/products'){
    const b=await bodyJson(request); const validator=await requirePassport(env,b.validator_passport_id); const type=enumValue(b.validation_type,TYPES);
    if(!type)throw new ValidationError('unsupported_validation_type',400);
    await requireQualifiedValidator(env,validator.id);
    const id=cleanId(b.product_id,'product_id'); const offerId=cleanId(b.payment_offer_id,'payment_offer_id'); const title=text(b.title,120); if(!title)throw new ValidationError('title_required',400);
    const validityDays=clampInt(b.validity_days||90,1,365); required(b.issued_at,'issued_at'); required(b.signature,'signature'); assertFresh(b.issued_at);
    const offer=await env.DB.prepare(`SELECT id,seller_passport_id,service_action,status,expires_at FROM service_offers WHERE id=?1`).bind(offerId).first();
    if(!offer||offer.status!=='active'||Date.parse(offer.expires_at)<=Date.now())return reply({error:'payment_offer_not_active'},409);
    if(offer.seller_passport_id!==validator.id)return reply({error:'payment_offer_validator_mismatch'},422);
    if(offer.service_action!==`validation:${type}`)return reply({error:'payment_offer_action_mismatch',expected:`validation:${type}`},422);
    const payload={domain:'accordtrace.validation.product.v1',product_id:id,validator_passport_id:validator.id,validation_type:type,title,description:text(b.description,500)||null,payment_offer_id:offerId,validity_days:validityDays,issued_at:new Date(b.issued_at).toISOString()};
    await verifyEd25519(validator.public_key,canonicalize(payload),b.signature);
    const now=new Date().toISOString(); const r=await env.DB.prepare(`INSERT OR IGNORE INTO validation_products (id,validator_passport_id,validation_type,title,description,payment_offer_id,validity_days,status,created_at,updated_at) VALUES (?1,?2,?3,?4,?5,?6,?7,'active',?8,?8)`).bind(id,validator.id,type,title,payload.description,offerId,validityDays,now).run();
    if((r.meta?.changes??1)===0)return reply({error:'validation_product_already_exists'},409);
    return reply({product:productView(await getProduct(env,id)),signature_verified:true},201);
  }

  if(request.method==='POST'&&url.pathname==='/api/v1/validation/requests'){
    const b=await bodyJson(request); const id=cleanId(b.request_id,'request_id'); const product=await getProduct(env,cleanId(b.product_id,'product_id')); if(!product||product.status!=='active')return reply({error:'validation_product_not_active'},404);
    const subject=await requirePassport(env,b.subject_passport_id); const orderId=cleanId(b.payment_order_id,'payment_order_id'); required(b.requested_at,'requested_at'); required(b.signature,'signature'); assertFresh(b.requested_at);
    const order=await env.DB.prepare(`SELECT id,offer_id,buyer_passport_id,seller_passport_id,payment_status FROM service_orders WHERE id=?1`).bind(orderId).first();
    if(!order)return reply({error:'payment_order_not_found'},404);
    if(order.payment_status!=='payment_authorized')return reply({error:'payment_not_authorized'},402);
    if(order.offer_id!==product.payment_offer_id||order.buyer_passport_id!==subject.id||order.seller_passport_id!==product.validator_passport_id)return reply({error:'payment_order_validation_mismatch'},422);
    const subjectRef=normalizeSubjectRef(product.validation_type,b.subject_ref); const subjectRefDigest=subjectRef?await sha256Hex(`accordtrace.validation.subject_ref.v1:${subjectRef}`):null;
    const payload={domain:'accordtrace.validation.request.v1',request_id:id,product_id:product.id,subject_passport_id:subject.id,validator_passport_id:product.validator_passport_id,validation_type:product.validation_type,payment_order_id:orderId,subject_ref:subjectRef,requested_at:new Date(b.requested_at).toISOString()};
    await verifyEd25519(subject.public_key,canonicalize(payload),b.signature);
    const now=new Date().toISOString();
    const exists=await env.DB.prepare(`SELECT id FROM validation_requests WHERE id=?1 OR payment_order_id=?2 LIMIT 1`).bind(id,orderId).first(); if(exists)return reply({error:'validation_request_or_payment_already_used'},409);
    const statements=[
      env.DB.prepare(`INSERT INTO validation_requests (id,product_id,subject_passport_id,validator_passport_id,validation_type,payment_order_id,subject_ref,subject_ref_digest,status,requested_at,created_at,updated_at) SELECT ?1,?2,?3,?4,?5,?6,?7,?8,'pending',?9,?10,?10 FROM service_orders WHERE id=?6 AND payment_status='payment_authorized' AND offer_id=?11 AND buyer_passport_id=?3 AND seller_passport_id=?4`).bind(id,product.id,subject.id,product.validator_passport_id,product.validation_type,orderId,publicSubjectRef(product.validation_type,subjectRef),subjectRefDigest,payload.requested_at,now,product.payment_offer_id),
      env.DB.prepare(`UPDATE service_orders SET payment_status='consumed',consumed_at=?1,updated_at=?1 WHERE id=?2 AND payment_status='payment_authorized' AND EXISTS (SELECT 1 FROM validation_requests WHERE id=?3 AND payment_order_id=?2)`).bind(now,orderId,id)
    ];
    let results;
    try{results=typeof env.DB.batch==='function'?await env.DB.batch(statements):[await statements[0].run(),await statements[1].run()];}catch{throw new ValidationError('validation_request_transaction_failed',409);}
    if(Number(results?.[0]?.meta?.changes??0)!==1||Number(results?.[1]?.meta?.changes??0)!==1)throw new ValidationError('payment_consumption_race_lost',409);
    return reply({validation_request:requestView(await getRequest(env,id)),payment:{order_id:orderId,status:'consumed',custody:'none'}},201);
  }

  if(request.method==='POST'&&url.pathname==='/api/v1/validation/results'){
    const b=await bodyJson(request); const row=await getRequest(env,cleanId(b.request_id,'request_id')); if(!row)return reply({error:'validation_request_not_found'},404); if(row.status!=='pending')return reply({error:'validation_request_not_pending'},409);
    const validator=await requirePassport(env,b.validator_passport_id); if(validator.id!==row.validator_passport_id)return reply({error:'validator_mismatch'},403); await requireQualifiedValidator(env,validator.id);
    const outcome=enumValue(b.outcome,OUTCOMES); if(!outcome)throw new ValidationError('unsupported_outcome',400); required(b.completed_at,'completed_at'); required(b.signature,'signature'); assertFresh(b.completed_at);
    const evidenceDigest=nullableDigest(b.evidence_digest); if(outcome==='passed'&&!evidenceDigest)throw new ValidationError('evidence_digest_required_for_passed_result',400);
    const product=await getProduct(env,row.product_id); const expiresAt=outcome==='passed'?new Date(Date.parse(b.completed_at)+Number(product.validity_days)*86400000).toISOString():null;
    const payload={domain:'accordtrace.validation.result.v1',request_id:row.id,product_id:row.product_id,subject_passport_id:row.subject_passport_id,validator_passport_id:validator.id,validation_type:row.validation_type,outcome,evidence_digest:evidenceDigest,completed_at:new Date(b.completed_at).toISOString(),expires_at:expiresAt};
    await verifyEd25519(validator.public_key,canonicalize(payload),b.signature);
    const now=new Date().toISOString();
    const statements=[
      env.DB.prepare(`UPDATE validation_requests SET status='completed',outcome=?1,evidence_digest=?2,completed_at=?3,expires_at=?4,updated_at=?5 WHERE id=?6 AND status='pending'`).bind(outcome,evidenceDigest,payload.completed_at,expiresAt,now,row.id),
      env.DB.prepare(`INSERT INTO validation_result_signatures (request_id,signature,created_at) SELECT ?1,?2,?3 WHERE EXISTS (SELECT 1 FROM validation_requests WHERE id=?1 AND status='completed' AND completed_at=?4)`).bind(row.id,text(b.signature,1200),now,payload.completed_at)
    ];
    let results; try{results=typeof env.DB.batch==='function'?await env.DB.batch(statements):[await statements[0].run(),await statements[1].run()];}catch{throw new ValidationError('validation_result_transaction_failed',409);}
    if(Number(results?.[0]?.meta?.changes??0)!==1||Number(results?.[1]?.meta?.changes??0)!==1)return reply({error:'validation_completion_race_lost'},409);
    return reply({validation_result:{...payload,signature_verified:true,status:'completed'},commercial_boundary:'Payment bought the assessment, not this outcome.'});
  }

  const requestMatch=url.pathname.match(/^\/api\/v1\/validation\/requests\/([^/]+)$/);
  if(request.method==='GET'&&requestMatch){const row=await getRequest(env,decodeURIComponent(requestMatch[1]));return row?reply({validation_request:requestView(row)}):reply({error:'validation_request_not_found'},404);}

  const passportMatch=url.pathname.match(/^\/api\/v1\/validation\/passports\/([^/]+)\/evidence$/);
  if(request.method==='GET'&&passportMatch){const passportId=decodeURIComponent(passportMatch[1]);const p=await requirePassport(env,passportId);const rows=await env.DB.prepare(`SELECT r.*,p.title,p.validity_days,s.signature FROM validation_requests r JOIN validation_products p ON p.id=r.product_id LEFT JOIN validation_result_signatures s ON s.request_id=r.id WHERE r.subject_passport_id=?1 AND r.status='completed' ORDER BY r.completed_at DESC LIMIT 100`).bind(p.id).all();const validations=(rows.results||[]).map(validationEvidenceView);return reply({passport_id:p.id,validations,summary:summarize(validations),trust_score:null,limitations:['A paid validation result is evidence, not a transferable trust score.','Payment cannot purchase a passed outcome.','Validator safety qualification reduces key-risk but does not prove legal or organizational independence.']});}

  return reply({error:'not_found'},404);
}

async function requireQualifiedValidator(env,id){const row=await env.DB.prepare(`SELECT state,recovery_key_fingerprint FROM attestor_safety_profiles WHERE passport_id=?1`).bind(id).first();if(!row||row.state!=='active')throw new ValidationError('validator_safety_profile_not_active',403);const shared=await env.DB.prepare(`SELECT COUNT(*) AS count FROM attestor_safety_profiles WHERE recovery_key_fingerprint=?1`).bind(row.recovery_key_fingerprint).first();if(Number(shared?.count||0)!==1)throw new ValidationError('validator_recovery_key_not_unique',403);return true;}
async function requirePassport(env,id){required(id,'passport_id');const p=await env.DB.prepare(`SELECT id,public_key,status FROM agent_passports WHERE id=?1`).bind(id).first();if(!p)throw new ValidationError('passport_not_found',404);if(p.status!=='active')throw new ValidationError('passport_not_active',403);return p;}
async function getProduct(env,id){return env.DB.prepare(`SELECT * FROM validation_products WHERE id=?1`).bind(id).first();}
async function getRequest(env,id){return env.DB.prepare(`SELECT * FROM validation_requests WHERE id=?1`).bind(id).first();}
function productView(r){if(!r)return null;return{id:r.id,validator_passport_id:r.validator_passport_id,validation_type:r.validation_type,title:r.title,description:r.description,payment_offer_id:r.payment_offer_id,validity_days:Number(r.validity_days),status:r.status,price:r.amount_atomic?{rail:r.rail,network:r.network,asset:r.asset,amount_atomic:r.amount_atomic,platform_fee_atomic:r.platform_fee_atomic,offer_expires_at:r.offer_expires_at}:null,created_at:r.created_at};}
function requestView(r){if(!r)return null;return{id:r.id,product_id:r.product_id,subject_passport_id:r.subject_passport_id,validator_passport_id:r.validator_passport_id,validation_type:r.validation_type,payment_order_id:r.payment_order_id,subject_ref:r.subject_ref,subject_ref_digest:r.subject_ref_digest,status:r.status,outcome:r.outcome,evidence_digest:r.evidence_digest,requested_at:r.requested_at,completed_at:r.completed_at,expires_at:r.expires_at};}
function validationEvidenceView(r){const expired=r.expires_at&&Date.parse(r.expires_at)<=Date.now();return{request_id:r.id,product_id:r.product_id,title:r.title,validation_type:r.validation_type,validator_passport_id:r.validator_passport_id,outcome:r.outcome,effective_status:expired?'expired':r.outcome,evidence_digest:r.evidence_digest,subject_ref:r.subject_ref,subject_ref_digest:r.subject_ref_digest,completed_at:r.completed_at,expires_at:r.expires_at,validator_signature:r.signature||null};}
function summarize(rows){const current=rows.filter(x=>x.effective_status!=='expired');return{completed:rows.length,current_passed:current.filter(x=>x.outcome==='passed').length,current_failed:current.filter(x=>x.outcome==='failed').length,current_inconclusive:current.filter(x=>x.outcome==='inconclusive').length,distinct_validators:new Set(current.map(x=>x.validator_passport_id)).size};}
function normalizeSubjectRef(type,v){const s=text(v,500);if(type==='domain_control'){if(!s)throw new ValidationError('domain_required',400);const d=s.toLowerCase().replace(/^https?:\/\//,'').split('/')[0].replace(/\.$/,'');if(!/^(?=.{1,253}$)(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/.test(d))throw new ValidationError('invalid_domain',400);return d;}if(!s)throw new ValidationError('subject_ref_required',400);return s;}
function publicSubjectRef(type,v){return type==='domain_control'?v:null;}
function nullableDigest(v){const s=String(v||'').trim().toLowerCase();if(!s)return null;if(!/^[a-f0-9]{64}$/.test(s))throw new ValidationError('evidence_digest_must_be_sha256_hex',400);return s;}
async function ensureSchema(env){if(schemaReady)return;const sql=[`CREATE TABLE IF NOT EXISTS validation_products (id TEXT PRIMARY KEY,validator_passport_id TEXT NOT NULL,validation_type TEXT NOT NULL,title TEXT NOT NULL,description TEXT,payment_offer_id TEXT NOT NULL,validity_days INTEGER NOT NULL,status TEXT NOT NULL DEFAULT 'active',created_at TEXT NOT NULL,updated_at TEXT NOT NULL)`,`CREATE TABLE IF NOT EXISTS validation_requests (id TEXT PRIMARY KEY,product_id TEXT NOT NULL,subject_passport_id TEXT NOT NULL,validator_passport_id TEXT NOT NULL,validation_type TEXT NOT NULL,payment_order_id TEXT NOT NULL UNIQUE,subject_ref TEXT,subject_ref_digest TEXT,status TEXT NOT NULL DEFAULT 'pending',outcome TEXT,evidence_digest TEXT,challenge_digest TEXT,challenge_expires_at TEXT,attestation_id TEXT,requested_at TEXT NOT NULL,completed_at TEXT,expires_at TEXT,created_at TEXT NOT NULL,updated_at TEXT NOT NULL)`,`CREATE TABLE IF NOT EXISTS validation_result_signatures (request_id TEXT PRIMARY KEY,signature TEXT NOT NULL,created_at TEXT NOT NULL)`];if(typeof env.DB.batch==='function')await env.DB.batch(sql.map(s=>env.DB.prepare(s)));else for(const s of sql)await env.DB.prepare(s).run();schemaReady=true;}
function cleanId(v,n){const s=String(v||'').trim();if(!/^[A-Za-z0-9][A-Za-z0-9._:-]{0,199}$/.test(s))throw new ValidationError(`${n}_invalid`,400);return s;}
function text(v,n){return String(v??'').trim().slice(0,n);} function required(v,n){if(!String(v??'').trim())throw new ValidationError(`${n}_required`,400);} function enumValue(v,a){const s=String(v||'');return a.includes(s)?s:null;} function clampInt(v,min,max){const n=Math.floor(Number(v));return Number.isFinite(n)?Math.max(min,Math.min(max,n)):min;}
function assertFresh(v){const t=Date.parse(v);if(!Number.isFinite(t)||Math.abs(Date.now()-t)>MAX_SKEW)throw new ValidationError('timestamp_out_of_range',400);}
async function bodyJson(r){try{return await r.json();}catch{throw new ValidationError('request_body_must_be_json',400);}}
async function sha256Hex(v){const b=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(String(v)));return[...new Uint8Array(b)].map(x=>x.toString(16).padStart(2,'0')).join('');}
async function verifyEd25519(pem,msg,sig){let k;try{k=await crypto.subtle.importKey('spki',pemBytes(pem),{name:'Ed25519'},false,['verify']);}catch{throw new ValidationError('invalid_public_key',422);}let ok=false;try{ok=await crypto.subtle.verify({name:'Ed25519'},k,b64(sig),new TextEncoder().encode(msg));}catch{}if(!ok)throw new ValidationError('signature_verification_failed',401);}
function pemBytes(p){const b=String(p||'').replace(/-----BEGIN PUBLIC KEY-----|-----END PUBLIC KEY-----|\s/g,'');return Uint8Array.from(atob(b),c=>c.charCodeAt(0));} function b64(v){const n=String(v||'').replace(/-/g,'+').replace(/_/g,'/');return Uint8Array.from(atob(n+'='.repeat((4-n.length%4)%4)),c=>c.charCodeAt(0));}
function canonicalize(v){if(v===null||typeof v==='boolean'||typeof v==='string'||typeof v==='number')return JSON.stringify(v);if(Array.isArray(v))return`[${v.map(canonicalize).join(',')}]`;if(typeof v==='object')return`{${Object.keys(v).sort().map(k=>`${JSON.stringify(k)}:${canonicalize(v[k])}`).join(',')}}`;throw new ValidationError('unsupported_value',400);}
function reply(b,s=200){return new Response(JSON.stringify(b),{status:s,headers:JSON_HEADERS});}
export class ValidationError extends Error{constructor(message,status=400){super(message);this.status=status;}}
