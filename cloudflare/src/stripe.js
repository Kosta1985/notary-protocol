const JSON_HEADERS={"content-type":"application/json; charset=utf-8"};
const MAX_SKEW=10*60*1000;
const STRIPE_TOLERANCE_SECONDS=300;
const TYPES=['domain_control','security_assessment','publisher_validation'];

export async function handleStripe(request,env,url=new URL(request.url)){
  if(!url.pathname.startsWith('/api/v1/launch/stripe/'))return null;
  if(request.method==='GET'&&url.pathname==='/api/v1/launch/stripe/capabilities'){
    const prices=priceAvailability(env);
    return reply({service:'AccordTrace Stripe Checkout Adapter',version:'0.1.0',checkout_enabled:Boolean(env.STRIPE_SECRET_KEY)&&Object.values(prices).some(Boolean),webhook_enabled:Boolean(env.STRIPE_WEBHOOK_SECRET),commercial_ready:Boolean(env.STRIPE_SECRET_KEY)&&Boolean(env.STRIPE_WEBHOOK_SECRET)&&Object.values(prices).some(Boolean),mode:env.STRIPE_SECRET_KEY?'configured':'disabled',supported_validation_types:TYPES,price_configured:prices,custody:'stripe',fulfillment_boundary:'A Checkout success redirect never authorizes validation. Only a verified Stripe webhook can mark an order paid.'});
  }

  if(request.method==='POST'&&url.pathname==='/api/v1/launch/stripe/checkout'){
    if(!env.STRIPE_SECRET_KEY)return reply({error:'stripe_not_configured'},503);
    const b=await bodyJson(request);
    const product=await env.DB.prepare(`SELECT id,validator_passport_id,validation_type,status FROM validation_products WHERE id=?1`).bind(cleanId(b.product_id,'product_id')).first();
    if(!product||product.status!=='active')return reply({error:'validation_product_not_active'},404);
    if(!TYPES.includes(product.validation_type))return reply({error:'unsupported_validation_type'},422);
    const priceId=priceForType(env,product.validation_type);if(!priceId)return reply({error:'stripe_price_not_configured',validation_type:product.validation_type},503);
    const subject=await env.DB.prepare(`SELECT id,status FROM agent_passports WHERE id=?1`).bind(cleanId(b.subject_passport_id,'subject_passport_id')).first();
    if(!subject||subject.status!=='active')return reply({error:'subject_passport_not_active'},404);
    const subjectRef=normalizeSubjectRef(product.validation_type,b.subject_ref);
    const subjectRefDigest=await sha256Hex(`accordtrace.validation.subject_ref.v1:${subjectRef}`);
    const publicRef=product.validation_type==='domain_control'?subjectRef:null;
    const orderId=`stpo_${randomHex(16)}`;const now=new Date().toISOString();
    await env.DB.prepare(`INSERT INTO stripe_validation_orders (id,product_id,subject_passport_id,validator_passport_id,validation_type,subject_ref,subject_ref_digest,payment_status,created_at,updated_at) VALUES (?1,?2,?3,?4,?5,?6,?7,'created',?8,?8)`).bind(orderId,product.id,subject.id,product.validator_passport_id,product.validation_type,publicRef,subjectRefDigest,now).run();
    const base=publicBase(env,url);const form=new URLSearchParams();
    form.set('mode','payment');form.set('success_url',`${base}/checkout-success.html?order_id=${encodeURIComponent(orderId)}&session_id={CHECKOUT_SESSION_ID}`);form.set('cancel_url',`${base}/validation.html?checkout=cancelled`);form.set('client_reference_id',orderId);form.set('line_items[0][price]',priceId);form.set('line_items[0][quantity]','1');form.set('metadata[accordtrace_order_id]',orderId);form.set('metadata[product_id]',product.id);form.set('metadata[subject_passport_id]',subject.id);form.set('metadata[validation_type]',product.validation_type);
    let session;try{session=await stripePost(env,'/v1/checkout/sessions',form,orderId);}catch(error){await env.DB.prepare(`UPDATE stripe_validation_orders SET payment_status='failed',updated_at=?1 WHERE id=?2 AND payment_status='created'`).bind(new Date().toISOString(),orderId).run();throw error;}
    if(!session?.id||!session?.url)throw new StripeError('stripe_checkout_session_invalid',502);
    await env.DB.prepare(`UPDATE stripe_validation_orders SET stripe_session_id=?1,payment_status='pending',updated_at=?2 WHERE id=?3 AND payment_status='created'`).bind(session.id,new Date().toISOString(),orderId).run();
    return reply({order_id:orderId,checkout_session_id:session.id,checkout_url:session.url,status:'pending',next_step:'Redirect the customer to checkout_url. Do not treat the success redirect as payment proof.'},201);
  }

  if(request.method==='POST'&&url.pathname==='/api/v1/launch/stripe/webhook'){
    if(!env.STRIPE_WEBHOOK_SECRET)return reply({error:'stripe_webhook_not_configured'},503);
    const raw=await request.text();const signature=request.headers.get('stripe-signature')||'';
    if(!await verifyStripeSignature(raw,signature,env.STRIPE_WEBHOOK_SECRET))return reply({error:'invalid_stripe_signature'},400);
    let event;try{event=JSON.parse(raw);}catch{return reply({error:'invalid_stripe_event_json'},400)}
    if(!event?.id||!event?.type)return reply({error:'invalid_stripe_event'},400);
    const now=new Date().toISOString();const inserted=await env.DB.prepare(`INSERT OR IGNORE INTO stripe_webhook_events (id,event_type,created_at) VALUES (?1,?2,?3)`).bind(String(event.id),String(event.type),now).run();
    if(Number(inserted.meta?.changes??0)===0)return reply({received:true,duplicate:true});
    const session=event?.data?.object||{};const orderId=String(session?.metadata?.accordtrace_order_id||session?.client_reference_id||'');
    if(orderId&&/^stpo_[a-f0-9]{32}$/.test(orderId)){
      if(event.type==='checkout.session.completed'||event.type==='checkout.session.async_payment_succeeded'){
        const paid=session.payment_status==='paid'||event.type==='checkout.session.async_payment_succeeded';
        await env.DB.prepare(`UPDATE stripe_validation_orders SET stripe_session_id=COALESCE(stripe_session_id,?1),stripe_payment_intent_id=?2,payment_status=?3,amount_total=?4,currency=?5,paid_at=CASE WHEN ?3='paid' THEN ?6 ELSE paid_at END,updated_at=?6 WHERE id=?7 AND payment_status IN ('created','pending')`).bind(String(session.id||''),nullableString(session.payment_intent),paid?'paid':'pending',nullableInt(session.amount_total),nullableString(session.currency)?.toLowerCase()||null,now,orderId).run();
      }else if(event.type==='checkout.session.async_payment_failed'||event.type==='checkout.session.expired'){
        await env.DB.prepare(`UPDATE stripe_validation_orders SET payment_status='failed',updated_at=?1 WHERE id=?2 AND payment_status IN ('created','pending')`).bind(now,orderId).run();
      }
    }
    return reply({received:true});
  }

  const orderMatch=url.pathname.match(/^\/api\/v1\/launch\/stripe\/orders\/([^/]+)$/);
  if(request.method==='GET'&&orderMatch){const row=await getOrder(env,decodeURIComponent(orderMatch[1]));return row?reply({order:orderView(row)}):reply({error:'stripe_order_not_found'},404);}

  const authorizeMatch=url.pathname.match(/^\/api\/v1\/launch\/stripe\/orders\/([^/]+)\/authorize-subject$/);
  if(request.method==='POST'&&authorizeMatch){
    const row=await getOrder(env,decodeURIComponent(authorizeMatch[1]));if(!row)return reply({error:'stripe_order_not_found'},404);if(row.payment_status!=='paid')return reply({error:'stripe_payment_not_authorized',status:row.payment_status},402);
    const b=await bodyJson(request);if(String(b.subject_passport_id||'')!==row.subject_passport_id)return reply({error:'subject_mismatch'},403);
    const passport=await env.DB.prepare(`SELECT id,public_key,status FROM agent_passports WHERE id=?1`).bind(row.subject_passport_id).first();if(!passport||passport.status!=='active')return reply({error:'subject_passport_not_active'},403);
    required(b.request_id,'request_id');required(b.requested_at,'requested_at');required(b.signature,'signature');assertFresh(b.requested_at);
    const rawRef=normalizeSubjectRef(row.validation_type,b.subject_ref??row.subject_ref);const digest=await sha256Hex(`accordtrace.validation.subject_ref.v1:${rawRef}`);if(digest!==row.subject_ref_digest)return reply({error:'subject_ref_mismatch'},422);
    const paymentOrderId=`stripe:${row.id}`;const payload={domain:'accordtrace.validation.request.v1',request_id:cleanId(b.request_id,'request_id'),product_id:row.product_id,subject_passport_id:passport.id,validator_passport_id:row.validator_passport_id,validation_type:row.validation_type,payment_order_id:paymentOrderId,subject_ref:rawRef,requested_at:new Date(b.requested_at).toISOString()};
    await verifyEd25519(passport.public_key,canonicalize(payload),b.signature);
    const now=new Date().toISOString();const publicRef=row.validation_type==='domain_control'?rawRef:null;
    const statements=[env.DB.prepare(`INSERT INTO validation_requests (id,product_id,subject_passport_id,validator_passport_id,validation_type,payment_order_id,subject_ref,subject_ref_digest,status,requested_at,created_at,updated_at) SELECT ?1,product_id,subject_passport_id,validator_passport_id,validation_type,?2,?3,subject_ref_digest,'pending',?4,?5,?5 FROM stripe_validation_orders WHERE id=?6 AND payment_status='paid'`).bind(payload.request_id,paymentOrderId,publicRef,payload.requested_at,now,row.id),env.DB.prepare(`UPDATE stripe_validation_orders SET payment_status='consumed',consumed_at=?1,updated_at=?1 WHERE id=?2 AND payment_status='paid' AND EXISTS (SELECT 1 FROM validation_requests WHERE id=?3 AND payment_order_id=?4)`).bind(now,row.id,payload.request_id,paymentOrderId)];
    let results;try{results=typeof env.DB.batch==='function'?await env.DB.batch(statements):[await statements[0].run(),await statements[1].run()];}catch{throw new StripeError('stripe_validation_authorization_transaction_failed',409)}
    if(Number(results?.[0]?.meta?.changes??0)!==1||Number(results?.[1]?.meta?.changes??0)!==1)return reply({error:'stripe_order_consumption_race_lost'},409);
    return reply({validation_request:{id:payload.request_id,product_id:row.product_id,subject_passport_id:passport.id,validator_passport_id:row.validator_passport_id,validation_type:row.validation_type,payment_order_id:paymentOrderId,status:'pending',requested_at:payload.requested_at},payment:{rail:'stripe',order_id:row.id,status:'consumed',custody:'stripe'},commercial_boundary:'Payment bought the assessment process, never a positive validation outcome.'},201);
  }

  return reply({error:'not_found'},404);
}

function priceAvailability(env){return{domain_control:Boolean(env.STRIPE_PRICE_DOMAIN_CONTROL),publisher_validation:Boolean(env.STRIPE_PRICE_PUBLISHER_VALIDATION),security_assessment:Boolean(env.STRIPE_PRICE_SECURITY_ASSESSMENT)}}
function priceForType(env,type){return type==='domain_control'?env.STRIPE_PRICE_DOMAIN_CONTROL:type==='publisher_validation'?env.STRIPE_PRICE_PUBLISHER_VALIDATION:type==='security_assessment'?env.STRIPE_PRICE_SECURITY_ASSESSMENT:null}
function publicBase(env,url){const raw=String(env.PUBLIC_BASE_URL||url.origin).replace(/\/$/,'');let u;try{u=new URL(raw)}catch{throw new StripeError('invalid_public_base_url',500)}if(u.protocol!=='https:'&&u.hostname!=='localhost')throw new StripeError('public_base_url_must_be_https',500);return u.origin}
async function stripePost(env,path,form,idempotencyKey){const key=String(env.STRIPE_SECRET_KEY||'');if(!key)throw new StripeError('stripe_not_configured',503);const headers={'content-type':'application/x-www-form-urlencoded','authorization':`Basic ${btoa(`${key}:`)}`,'idempotency-key':idempotencyKey};if(env.STRIPE_API_VERSION)headers['stripe-version']=String(env.STRIPE_API_VERSION);let response;try{response=await fetch(`https://api.stripe.com${path}`,{method:'POST',headers,body:form.toString(),redirect:'error'})}catch{throw new StripeError('stripe_api_unavailable',502)}let body={};try{body=await response.json()}catch{}if(!response.ok)throw new StripeError(body?.error?.message||`stripe_api_http_${response.status}`,502);return body}
async function verifyStripeSignature(raw,header,secret){const parts=String(header||'').split(',').map(x=>x.trim());const timestamp=parts.find(x=>x.startsWith('t='))?.slice(2);const signatures=parts.filter(x=>x.startsWith('v1=')).map(x=>x.slice(3));if(!timestamp||!signatures.length||!/^\d+$/.test(timestamp))return false;if(Math.abs(Date.now()/1000-Number(timestamp))>STRIPE_TOLERANCE_SECONDS)return false;const key=await crypto.subtle.importKey('raw',new TextEncoder().encode(String(secret)),{name:'HMAC',hash:'SHA-256'},false,['sign']);const sig=await crypto.subtle.sign('HMAC',key,new TextEncoder().encode(`${timestamp}.${raw}`));const expected=[...new Uint8Array(sig)].map(x=>x.toString(16).padStart(2,'0')).join('');return signatures.some(x=>timingSafeEqualHex(expected,x))}
function timingSafeEqualHex(a,b){if(!/^[a-f0-9]+$/i.test(b)||a.length!==b.length)return false;let diff=0;for(let i=0;i<a.length;i++)diff|=a.charCodeAt(i)^b.charCodeAt(i);return diff===0}
async function getOrder(env,id){if(!/^stpo_[a-f0-9]{32}$/.test(String(id||'')))return null;return env.DB.prepare(`SELECT * FROM stripe_validation_orders WHERE id=?1`).bind(id).first()}
function orderView(r){return{id:r.id,product_id:r.product_id,subject_passport_id:r.subject_passport_id,validator_passport_id:r.validator_passport_id,validation_type:r.validation_type,payment_status:r.payment_status,amount_total:r.amount_total??null,currency:r.currency??null,created_at:r.created_at,paid_at:r.paid_at??null,consumed_at:r.consumed_at??null}}
function normalizeSubjectRef(type,v){const s=String(v??'').trim();if(type==='domain_control'){const d=s.toLowerCase().replace(/^https?:\/\//,'').split('/')[0].replace(/\.$/,'');if(!/^(?=.{1,253}$)(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/.test(d))throw new StripeError('invalid_domain',400);return d}if(!s||s.length>500)throw new StripeError('subject_ref_required',400);return s}
function cleanId(v,n){const s=String(v||'').trim();if(!/^[A-Za-z0-9][A-Za-z0-9._:-]{0,199}$/.test(s))throw new StripeError(`${n}_invalid`,400);return s}function required(v,n){if(!String(v??'').trim())throw new StripeError(`${n} is required`,400)}function assertFresh(v){const t=Date.parse(v);if(!Number.isFinite(t)||Math.abs(Date.now()-t)>MAX_SKEW)throw new StripeError('timestamp_out_of_range',400)}function randomHex(n){const b=crypto.getRandomValues(new Uint8Array(n));return[...b].map(x=>x.toString(16).padStart(2,'0')).join('')}function nullableString(v){const s=String(v??'').trim();return s||null}function nullableInt(v){const n=Number(v);return Number.isSafeInteger(n)&&n>=0?n:null}
async function sha256Hex(v){const d=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(String(v)));return[...new Uint8Array(d)].map(x=>x.toString(16).padStart(2,'0')).join('')}
async function verifyEd25519(pem,msg,sig){let k;try{k=await crypto.subtle.importKey('spki',pemBytes(pem),{name:'Ed25519'},false,['verify'])}catch{throw new StripeError('invalid_public_key',422)}let ok=false;try{ok=await crypto.subtle.verify({name:'Ed25519'},k,b64(sig),new TextEncoder().encode(msg))}catch{}if(!ok)throw new StripeError('signature_verification_failed',401)}function pemBytes(p){const b=String(p||'').replace(/-----BEGIN PUBLIC KEY-----|-----END PUBLIC KEY-----|\s/g,'');return Uint8Array.from(atob(b),c=>c.charCodeAt(0))}function b64(v){const n=String(v||'').replace(/-/g,'+').replace(/_/g,'/');return Uint8Array.from(atob(n+'='.repeat((4-n.length%4)%4)),c=>c.charCodeAt(0))}
function canonicalize(v){if(v===null||typeof v==='boolean'||typeof v==='string'||typeof v==='number')return JSON.stringify(v);if(Array.isArray(v))return`[${v.map(canonicalize).join(',')}]`;return`{${Object.keys(v).sort().map(k=>`${JSON.stringify(k)}:${canonicalize(v[k])}`).join(',')}}`}
async function bodyJson(r){try{return await r.json()}catch{throw new StripeError('request_body_must_be_json',400)}}function reply(b,s=200){return new Response(JSON.stringify(b),{status:s,headers:JSON_HEADERS})}
export class StripeError extends Error{constructor(message,status=400){super(message);this.status=status}}
