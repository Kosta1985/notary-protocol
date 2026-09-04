import { qualifyDirectAffiliateSale, reverseDirectAffiliateSale } from './affiliate-settlement.js';

const JSON_HEADERS={"content-type":"application/json; charset=utf-8"};
const MAX_SKEW=10*60*1000;
const STRIPE_TOLERANCE_SECONDS=300;
const PRODUCT_ID='agent_passport_certificate';
const PRODUCT_VERSION='1';

export async function handlePassportProduct(request,env,url=new URL(request.url)){
  if(!url.pathname.startsWith('/api/v1/passport-product/'))return null;

  if(request.method==='GET'&&url.pathname==='/api/v1/passport-product/capabilities'){
    const policy=productPolicy(env);
    return reply({
      service:'AccordTrace Agent Passport Certificate',
      version:'0.1.0',
      product:{id:PRODUCT_ID,version:PRODUCT_VERSION,price:{amount_atomic:policy.priceAtomic,currency:policy.currency}},
      cryptographic_passport_registration:'available_separately',
      affiliate_enrollment:'optional_and_separate',
      checkout_enabled:policy.checkoutEnabled,
      webhook_enabled:Boolean(env.STRIPE_WEBHOOK_SECRET),
      certificate_signing_enabled:Boolean(env.NOTARY_PRIVATE_JWK),
      referral_pricing_consistent:policy.referralPricingConsistent,
      commercial_ready:policy.commercialReady,
      cash_affiliate_payouts_enabled:false,
      fulfillment_boundary:'Only a verified Stripe webhook can mark the dedicated Passport Certificate order paid and trigger certificate issuance. Browser redirects and validation-product payments cannot fulfill this product.',
      certificate_scope:'AccordTrace-signed issuance artifact bound to cryptographic Passport key control; not legal identity, KYC, general Trust, safety or validation.'
    });
  }

  if(request.method==='POST'&&url.pathname==='/api/v1/passport-product/checkout'){
    const policy=productPolicy(env);
    if(!policy.commercialReady)return reply({error:'passport_product_checkout_not_ready',requirements:policy.readiness},503);
    const b=await bodyJson(request);
    const passportId=cleanId(b.passport_id,'passport_id');
    const requestId=cleanId(b.request_id,'request_id');
    const requestedAt=freshIso(b.requested_at);
    const referralCode=normalizeReferralCode(b.referral_code);
    const passport=await activePassport(env,passportId);
    const payload={domain:'accordtrace.passport-product.checkout.v1',request_id:requestId,passport_id:passportId,product_id:PRODUCT_ID,product_version:PRODUCT_VERSION,referral_code:referralCode,requested_at:requestedAt};
    await verifyEd25519(passport.public_key,canonicalize(payload),b.signature);

    const replay=await env.DB.prepare(`SELECT * FROM passport_product_orders WHERE checkout_request_id=?1`).bind(requestId).first();
    if(replay){
      if(replay.passport_id!==passportId||nullableString(replay.referral_code)!==referralCode)return reply({error:'checkout_request_replay_mismatch'},409);
      return reply({order:orderView(replay),checkout_url:replay.payment_status==='pending'?replay.stripe_checkout_url:null,idempotent:true});
    }

    const certificate=await env.DB.prepare(`SELECT id,state,issued_at FROM agent_passport_certificates WHERE passport_id=?1 AND product_id=?2 AND product_version=?3 LIMIT 1`).bind(passportId,PRODUCT_ID,PRODUCT_VERSION).first();
    if(certificate)return reply({error:'passport_certificate_already_issued',certificate:{id:certificate.id,state:certificate.state,issued_at:certificate.issued_at}},409);

    const openOrder=await env.DB.prepare(`SELECT * FROM passport_product_orders WHERE passport_id=?1 AND product_id=?2 AND product_version=?3 AND payment_status IN ('created','pending','paid','review','fulfilled') ORDER BY created_at DESC LIMIT 1`).bind(passportId,PRODUCT_ID,PRODUCT_VERSION).first();
    if(openOrder)return reply({error:'passport_certificate_order_already_open',order:orderView(openOrder),checkout_url:openOrder.payment_status==='pending'?openOrder.stripe_checkout_url:null},409);

    let attribution=null;
    if(referralCode){
      attribution=await env.DB.prepare(`SELECT id,state,referral_code,referrer_passport_id,referred_passport_id FROM affiliate_attributions WHERE referred_passport_id=?1 AND referral_code=?2 LIMIT 1`).bind(passportId,referralCode).first();
      if(!attribution)return reply({error:'referral_attribution_required',referral_code:referralCode,next_step:'Cryptographically reserve the direct attribution with POST /api/v1/network/attributions/reserve before creating the product checkout.'},409);
      if(!['reserved','held'].includes(attribution.state))return reply({error:'referral_attribution_not_eligible',state:attribution.state},409);
      if(attribution.referrer_passport_id===passportId)return reply({error:'self_referral_not_allowed'},422);
    }

    const orderId=`atpo_${randomHex(16)}`;
    const now=new Date().toISOString();
    const statements=[
      env.DB.prepare(`INSERT INTO passport_product_request_nonces(request_id,passport_id,purpose,created_at) VALUES(?1,?2,'checkout',?3)`).bind(requestId,passportId,now),
      env.DB.prepare(`INSERT INTO passport_product_orders(id,checkout_request_id,passport_id,product_id,product_version,referral_attribution_id,referral_code,payment_status,created_at,updated_at) VALUES(?1,?2,?3,?4,?5,?6,?7,'created',?8,?8)`).bind(orderId,requestId,passportId,PRODUCT_ID,PRODUCT_VERSION,attribution?.id||null,referralCode,now)
    ];
    try{if(typeof env.DB.batch==='function')await env.DB.batch(statements);else for(const statement of statements)await statement.run();}
    catch{throw new PassportProductError('passport_product_order_conflict',409)}

    const base=publicBase(env,url);
    const form=new URLSearchParams();
    form.set('mode','payment');
    form.set('success_url',`${base}/passport-checkout-success.html?order_id=${encodeURIComponent(orderId)}&session_id={CHECKOUT_SESSION_ID}`);
    form.set('cancel_url',`${base}/agents.html?passport_checkout=cancelled`);
    form.set('client_reference_id',orderId);
    form.set('line_items[0][price]',String(env.STRIPE_PRICE_AGENT_PASSPORT));
    form.set('line_items[0][quantity]','1');
    form.set('metadata[accordtrace_passport_order_id]',orderId);
    form.set('metadata[passport_id]',passportId);
    form.set('metadata[product_id]',PRODUCT_ID);
    form.set('metadata[product_version]',PRODUCT_VERSION);
    form.set('payment_intent_data[metadata][accordtrace_passport_order_id]',orderId);
    form.set('payment_intent_data[metadata][passport_id]',passportId);
    form.set('payment_intent_data[metadata][product_id]',PRODUCT_ID);
    if(referralCode)form.set('metadata[referral_code]',referralCode);

    let session;
    try{session=await stripePost(env,'/v1/checkout/sessions',form,orderId);}
    catch(error){await env.DB.prepare(`UPDATE passport_product_orders SET payment_status='failed',review_reason=?1,updated_at=?2 WHERE id=?3 AND payment_status='created'`).bind('stripe_checkout_creation_failed',new Date().toISOString(),orderId).run();throw error;}
    if(!session?.id||!session?.url)throw new PassportProductError('stripe_checkout_session_invalid',502);
    const update=await env.DB.prepare(`UPDATE passport_product_orders SET stripe_session_id=?1,stripe_checkout_url=?2,payment_status='pending',updated_at=?3 WHERE id=?4 AND payment_status='created'`).bind(String(session.id),String(session.url),new Date().toISOString(),orderId).run();
    if(Number(update.meta?.changes??0)!==1)throw new PassportProductError('passport_product_order_state_conflict',409);
    return reply({order:{id:orderId,passport_id:passportId,product_id:PRODUCT_ID,product_version:PRODUCT_VERSION,payment_status:'pending',referral_attribution_id:attribution?.id||null},checkout_session_id:session.id,checkout_url:session.url,next_step:'Use checkout_url. The success redirect is not payment proof; only the verified webhook can fulfill the certificate or qualify a referral commission.'},201);
  }

  if(request.method==='POST'&&url.pathname==='/api/v1/passport-product/stripe/webhook'){
    if(!env.STRIPE_WEBHOOK_SECRET)return reply({error:'stripe_webhook_not_configured'},503);
    const raw=await request.text();
    const signature=request.headers.get('stripe-signature')||'';
    if(!await verifyStripeSignature(raw,signature,env.STRIPE_WEBHOOK_SECRET))return reply({error:'invalid_stripe_signature'},400);
    let event;try{event=JSON.parse(raw);}catch{return reply({error:'invalid_stripe_event_json'},400)}
    if(!event?.id||!event?.type)return reply({error:'invalid_stripe_event'},400);
    const eventId=String(event.id),eventType=String(event.type),now=new Date().toISOString();
    await env.DB.prepare(`INSERT OR IGNORE INTO passport_product_stripe_events(id,event_type,created_at) VALUES(?1,?2,?3)`).bind(eventId,eventType,now).run();
    const existing=await env.DB.prepare(`SELECT processed_at FROM passport_product_stripe_events WHERE id=?1`).bind(eventId).first();
    if(existing?.processed_at)return reply({received:true,duplicate:true});
    try{
      const outcome=await processStripeEvent(env,event,url);
      await env.DB.prepare(`UPDATE passport_product_stripe_events SET processed_at=?1,processing_error=NULL WHERE id=?2`).bind(new Date().toISOString(),eventId).run();
      return reply({received:true,...outcome});
    }catch(error){
      await env.DB.prepare(`UPDATE passport_product_stripe_events SET processing_error=?1 WHERE id=?2`).bind(String(error?.message||'processing_failed').slice(0,500),eventId).run();
      throw error;
    }
  }

  const orderMatch=url.pathname.match(/^\/api\/v1\/passport-product\/orders\/([^/]+)$/);
  if(request.method==='GET'&&orderMatch){
    const row=await getOrder(env,decodeURIComponent(orderMatch[1]));
    if(!row)return reply({error:'passport_product_order_not_found'},404);
    const cert=await env.DB.prepare(`SELECT id,state,issued_at FROM agent_passport_certificates WHERE order_id=?1`).bind(row.id).first();
    return reply({order:orderView(row),certificate:cert?{id:cert.id,state:cert.state,issued_at:cert.issued_at,url:`${publicBase(env,url)}/api/v1/passport-product/certificates/${encodeURIComponent(cert.id)}`}:null,payment_truth:'Stripe webhook state only; checkout success URLs are not authoritative.'});
  }

  const certificateMatch=url.pathname.match(/^\/api\/v1\/passport-product\/certificates\/([^/]+)$/);
  if(request.method==='GET'&&certificateMatch){
    const id=decodeURIComponent(certificateMatch[1]);
    if(!/^atpc_[a-f0-9]{32}$/.test(id))return reply({error:'passport_certificate_not_found'},404);
    const row=await env.DB.prepare(`SELECT id,state,certificate_json,issued_at,refunded_at,revoked_at FROM agent_passport_certificates WHERE id=?1`).bind(id).first();
    if(!row)return reply({error:'passport_certificate_not_found'},404);
    return reply({certificate:JSON.parse(row.certificate_json),state:row.state,issued_at:row.issued_at,refunded_at:row.refunded_at||null,revoked_at:row.revoked_at||null,state_boundary:'Certificate signature proves historical AccordTrace issuance. Current commercial state is reported separately and does not imply Trust, legal identity, KYC, safety or validation.'});
  }

  const passportCertificateMatch=url.pathname.match(/^\/api\/v1\/passport-product\/passports\/([^/]+)\/certificate$/);
  if(request.method==='GET'&&passportCertificateMatch){
    const passportId=cleanId(decodeURIComponent(passportCertificateMatch[1]),'passport_id');
    const row=await env.DB.prepare(`SELECT id,state,issued_at,refunded_at,revoked_at FROM agent_passport_certificates WHERE passport_id=?1 AND product_id=?2 AND product_version=?3 ORDER BY issued_at DESC LIMIT 1`).bind(passportId,PRODUCT_ID,PRODUCT_VERSION).first();
    return row?reply({passport_id:passportId,certificate:{id:row.id,state:row.state,issued_at:row.issued_at,refunded_at:row.refunded_at||null,revoked_at:row.revoked_at||null,url:`${publicBase(env,url)}/api/v1/passport-product/certificates/${encodeURIComponent(row.id)}`}}):reply({error:'passport_certificate_not_found'},404);
  }

  if(request.method==='POST'&&url.pathname==='/api/v1/passport-product/certificates/verify'){
    const body=await bodyJson(request);
    const result=await verifyCertificate(body.certificate??body,env);
    return reply(result,result.valid?200:422);
  }

  return reply({error:'not_found'},404);
}

async function processStripeEvent(env,event,url){
  const type=String(event.type);
  const object=event?.data?.object||{};
  if(type==='checkout.session.completed'||type==='checkout.session.async_payment_succeeded'){
    const orderId=String(object?.metadata?.accordtrace_passport_order_id||object?.client_reference_id||'');
    if(!/^atpo_[a-f0-9]{32}$/.test(orderId))return{ignored:true,reason:'not_a_passport_product_order'};
    const order=await getOrder(env,orderId);if(!order)return{ignored:true,reason:'passport_product_order_not_found'};
    const paid=object.payment_status==='paid'||type==='checkout.session.async_payment_succeeded';
    if(!paid){await env.DB.prepare(`UPDATE passport_product_orders SET stripe_session_id=COALESCE(stripe_session_id,?1),stripe_payment_intent_id=?2,stripe_customer_id=?3,payment_status='pending',amount_total=?4,currency=?5,updated_at=?6 WHERE id=?7 AND payment_status IN ('created','pending')`).bind(nullableString(object.id),nullableString(object.payment_intent),nullableString(object.customer),nullableInt(object.amount_total),nullableString(object.currency)?.toLowerCase()||null,new Date().toISOString(),orderId).run();return{order_id:orderId,status:'pending'};}
    const policy=productPolicy(env);const amount=nullableInt(object.amount_total);const currency=nullableString(object.currency)?.toLowerCase()||null;const now=new Date().toISOString();
    if(amount!==policy.priceAtomic||currency!==policy.currency){
      await env.DB.prepare(`UPDATE passport_product_orders SET stripe_session_id=COALESCE(stripe_session_id,?1),stripe_payment_intent_id=?2,stripe_customer_id=?3,payment_status='review',amount_total=?4,currency=?5,review_reason='paid_amount_or_currency_mismatch',paid_at=?6,updated_at=?6 WHERE id=?7 AND payment_status IN ('created','pending','paid')`).bind(nullableString(object.id),nullableString(object.payment_intent),nullableString(object.customer),amount,currency,now,orderId).run();
      return{order_id:orderId,status:'review',reason:'paid_amount_or_currency_mismatch'};
    }
    await env.DB.prepare(`UPDATE passport_product_orders SET stripe_session_id=COALESCE(stripe_session_id,?1),stripe_payment_intent_id=?2,stripe_customer_id=?3,payment_status=CASE WHEN payment_status='fulfilled' THEN 'fulfilled' ELSE 'paid' END,amount_total=?4,currency=?5,paid_at=COALESCE(paid_at,?6),updated_at=?6 WHERE id=?7 AND payment_status IN ('created','pending','paid','fulfilled')`).bind(nullableString(object.id),nullableString(object.payment_intent),nullableString(object.customer),amount,currency,now,orderId).run();
    const result=await fulfillPaidOrder(env,orderId,url,object);
    return{order_id:orderId,status:'fulfilled',certificate_id:result.certificate_id,affiliate:result.affiliate};
  }
  if(type==='checkout.session.async_payment_failed'||type==='checkout.session.expired'){
    const orderId=String(object?.metadata?.accordtrace_passport_order_id||object?.client_reference_id||'');
    if(!/^atpo_[a-f0-9]{32}$/.test(orderId))return{ignored:true,reason:'not_a_passport_product_order'};
    await env.DB.prepare(`UPDATE passport_product_orders SET payment_status='failed',review_reason=?1,updated_at=?2 WHERE id=?3 AND payment_status IN ('created','pending')`).bind(type,new Date().toISOString(),orderId).run();
    return{order_id:orderId,status:'failed'};
  }
  if(type==='charge.refunded'||type==='charge.dispute.created'){
    const paymentIntent=nullableString(object.payment_intent);
    if(!paymentIntent)return{ignored:true,reason:'payment_intent_missing'};
    const order=await env.DB.prepare(`SELECT * FROM passport_product_orders WHERE stripe_payment_intent_id=?1 LIMIT 1`).bind(paymentIntent).first();
    if(!order)return{ignored:true,reason:'not_a_passport_product_payment'};
    const state=type==='charge.refunded'?'refunded':'chargeback';const now=new Date().toISOString();
    await env.DB.prepare(`UPDATE passport_product_orders SET payment_status=?1,refunded_at=?2,updated_at=?2 WHERE id=?3 AND payment_status IN ('paid','fulfilled','review')`).bind(state,now,order.id).run();
    await env.DB.prepare(`UPDATE agent_passport_certificates SET state='refunded',refunded_at=?1,updated_at=?1 WHERE order_id=?2 AND state='active'`).bind(now,order.id).run();
    const reversal=await reverseDirectAffiliateSale(env,{externalOrderRef:`passport-product:${order.id}`,reasonCode:type==='charge.refunded'?'passport_product_refund':'passport_product_chargeback'});
    return{order_id:order.id,status:state,affiliate_reversal:reversal};
  }
  return{ignored:true,reason:'event_type_not_used'};
}

async function fulfillPaidOrder(env,orderId,url,stripeSession){
  let order=await getOrder(env,orderId);if(!order)throw new PassportProductError('passport_product_order_not_found',404);
  const existing=await env.DB.prepare(`SELECT id,certificate_json FROM agent_passport_certificates WHERE order_id=?1`).bind(orderId).first();
  let certificateId=existing?.id||null;
  if(!existing){
    if(order.payment_status!=='paid')throw new PassportProductError('passport_product_order_not_paid',409);
    const passport=await activePassport(env,order.passport_id);
    const certificate=await issueCertificate(env,passport,order,url);
    certificateId=certificate.id;
    try{await env.DB.prepare(`INSERT INTO agent_passport_certificates(id,order_id,passport_id,product_id,product_version,public_key_fingerprint,state,certificate_json,issued_at,updated_at) VALUES(?1,?2,?3,?4,?5,?6,'active',?7,?8,?8)`).bind(certificate.id,order.id,order.passport_id,PRODUCT_ID,PRODUCT_VERSION,certificate.public_key_fingerprint,JSON.stringify(certificate),certificate.issued_at).run();}
    catch(error){const raced=await env.DB.prepare(`SELECT id FROM agent_passport_certificates WHERE order_id=?1`).bind(orderId).first();if(!raced)throw error;certificateId=raced.id;}
  }
  order=await getOrder(env,orderId);
  let affiliate={eligible:false,reason:'no_referral_attribution'};
  if(order.referral_attribution_id){
    const paymentIdentity=stripeSession?.customer?`stripe_customer:${stripeSession.customer}`:`stripe_session:${stripeSession?.id||order.stripe_session_id}`;
    affiliate=await qualifyDirectAffiliateSale(env,{attributionId:order.referral_attribution_id,externalOrderRef:`passport-product:${order.id}`,paymentIdentityRef:paymentIdentity,grossAmountAtomic:Number(order.amount_total),currency:order.currency});
  }
  await env.DB.prepare(`UPDATE passport_product_orders SET payment_status='fulfilled',fulfilled_at=COALESCE(fulfilled_at,?1),updated_at=?1 WHERE id=?2 AND payment_status IN ('paid','fulfilled')`).bind(new Date().toISOString(),orderId).run();
  return{certificate_id:certificateId,affiliate};
}

async function issueCertificate(env,passport,order,url){
  if(!env.NOTARY_PRIVATE_JWK)throw new PassportProductError('certificate_signing_not_configured',503);
  const issuedAt=new Date().toISOString();const id=`atpc_${randomHex(16)}`;const base=publicBase(env,url);
  const publicKeyFingerprint=await sha256Hex(pemBytes(passport.public_key));
  const unsigned={schema:'accordtrace.agent-passport-certificate.v1',id,passport_id:passport.id,public_key_fingerprint:`sha256:${publicKeyFingerprint}`,product:{id:PRODUCT_ID,version:PRODUCT_VERSION,price_at_issue:{amount_atomic:Number(order.amount_total),currency:String(order.currency).toLowerCase()}},issued_at:issuedAt,certificate_url:`${base}/api/v1/passport-product/certificates/${encodeURIComponent(id)}`,verification_endpoint:`${base}/api/v1/passport-product/certificates/verify`,scope:'AccordTrace issuance bound to cryptographic Passport key control; not legal identity, KYC, Trust, safety or validation.'};
  const privateJwk=JSON.parse(env.NOTARY_PRIVATE_JWK);const privateKey=await crypto.subtle.importKey('jwk',privateJwk,{name:'Ed25519'},false,['sign']);const signature=await crypto.subtle.sign('Ed25519',privateKey,new TextEncoder().encode(canonicalize(unsigned)));const issuerPublicKey=await issuerPublicPem(privateJwk);
  return{...unsigned,issuer:{name:'AccordTrace',algorithm:'Ed25519',public_key:issuerPublicKey,signature:base64url(new Uint8Array(signature))}};
}

async function verifyCertificate(certificate,env){
  const checks=[];const add=(code,passed)=>checks.push({code,passed:Boolean(passed)});
  const structure=certificate&&typeof certificate==='object'&&!Array.isArray(certificate)&&certificate.issuer&&typeof certificate.issuer==='object';add('certificate_structure',structure);if(!structure)return{valid:false,checks,certificate_id:null};
  const {issuer,...unsigned}=certificate;add('schema',unsigned.schema==='accordtrace.agent-passport-certificate.v1');add('issuer_algorithm',issuer.algorithm==='Ed25519');
  let currentKey=null;try{currentKey=env.NOTARY_PRIVATE_JWK?await issuerPublicPem(JSON.parse(env.NOTARY_PRIVATE_JWK)):null}catch{}
  add('trusted_issuer_key',Boolean(currentKey)&&issuer.public_key===currentKey);
  let signatureValid=false;try{const key=await crypto.subtle.importKey('spki',pemBytes(issuer.public_key),{name:'Ed25519'},false,['verify']);signatureValid=await crypto.subtle.verify('Ed25519',key,fromBase64url(issuer.signature),new TextEncoder().encode(canonicalize(unsigned)));}catch{}
  add('certificate_signature',signatureValid);return{valid:checks.every(x=>x.passed),checks,certificate_id:typeof certificate.id==='string'?certificate.id:null,scope:certificate.scope||null};
}

function productPolicy(env){
  const priceAtomic=envInt(env.PASSPORT_PRODUCT_PRICE_ATOMIC,200,1,1_000_000),currency=String(env.PASSPORT_PRODUCT_CURRENCY||'usd').toLowerCase();const affiliatePrice=envInt(env.AFFILIATE_PASSPORT_PRICE_ATOMIC,200,1,1_000_000),affiliateCurrency=String(env.AFFILIATE_CURRENCY||'usd').toLowerCase();const referralPricingConsistent=priceAtomic===affiliatePrice&&currency===affiliateCurrency;const checkoutEnabled=Boolean(env.STRIPE_SECRET_KEY)&&Boolean(env.STRIPE_PRICE_AGENT_PASSPORT);const readiness={stripe_secret:Boolean(env.STRIPE_SECRET_KEY),stripe_price:Boolean(env.STRIPE_PRICE_AGENT_PASSPORT),stripe_webhook_secret:Boolean(env.STRIPE_WEBHOOK_SECRET),certificate_signing_key:Boolean(env.NOTARY_PRIVATE_JWK),referral_pricing_consistent:referralPricingConsistent};return{priceAtomic,currency,affiliatePrice,affiliateCurrency,referralPricingConsistent,checkoutEnabled,commercialReady:Object.values(readiness).every(Boolean),readiness};
}
async function activePassport(env,id){const row=await env.DB.prepare(`SELECT id,public_key,status FROM agent_passports WHERE id=?1`).bind(id).first();if(!row||row.status!=='active')throw new PassportProductError('passport_not_active',404);return row}
async function getOrder(env,id){if(!/^atpo_[a-f0-9]{32}$/.test(String(id||'')))return null;return env.DB.prepare(`SELECT * FROM passport_product_orders WHERE id=?1`).bind(id).first()}
function orderView(row){return{id:row.id,passport_id:row.passport_id,product_id:row.product_id,product_version:row.product_version,payment_status:row.payment_status,amount_total:row.amount_total??null,currency:row.currency??null,referral_attribution_id:row.referral_attribution_id??null,referral_code:row.referral_code??null,created_at:row.created_at,paid_at:row.paid_at??null,fulfilled_at:row.fulfilled_at??null,refunded_at:row.refunded_at??null,review_reason:row.review_reason??null}}
function normalizeReferralCode(value){const s=String(value??'').trim().toLowerCase();if(!s)return null;if(!/^atr_[a-f0-9]{16}$/.test(s))throw new PassportProductError('referral_code_invalid',400);return s}
function cleanId(v,n){const s=String(v||'').trim();if(!/^[A-Za-z0-9][A-Za-z0-9._:-]{0,199}$/.test(s))throw new PassportProductError(`${n}_invalid`,400);return s}
function freshIso(v){const t=Date.parse(v);if(!Number.isFinite(t)||Math.abs(Date.now()-t)>MAX_SKEW)throw new PassportProductError('timestamp_out_of_range',400);return new Date(t).toISOString()}
function publicBase(env,url){const raw=String(env.PUBLIC_BASE_URL||url.origin).replace(/\/$/,'');let u;try{u=new URL(raw)}catch{throw new PassportProductError('invalid_public_base_url',500)}if(u.protocol!=='https:'&&u.hostname!=='localhost')throw new PassportProductError('public_base_url_must_be_https',500);return u.origin}
async function stripePost(env,path,form,idempotencyKey){const key=String(env.STRIPE_SECRET_KEY||'');if(!key)throw new PassportProductError('stripe_not_configured',503);const headers={'content-type':'application/x-www-form-urlencoded','authorization':`Basic ${btoa(`${key}:`)}`,'idempotency-key':idempotencyKey};if(env.STRIPE_API_VERSION)headers['stripe-version']=String(env.STRIPE_API_VERSION);let response;try{response=await fetch(`https://api.stripe.com${path}`,{method:'POST',headers,body:form.toString(),redirect:'error'})}catch{throw new PassportProductError('stripe_api_unavailable',502)}let body={};try{body=await response.json()}catch{}if(!response.ok)throw new PassportProductError(body?.error?.message||`stripe_api_http_${response.status}`,502);return body}
async function verifyStripeSignature(raw,header,secret){const parts=String(header||'').split(',').map(x=>x.trim());const timestamp=parts.find(x=>x.startsWith('t='))?.slice(2);const signatures=parts.filter(x=>x.startsWith('v1=')).map(x=>x.slice(3));if(!timestamp||!signatures.length||!/^\d+$/.test(timestamp))return false;if(Math.abs(Date.now()/1000-Number(timestamp))>STRIPE_TOLERANCE_SECONDS)return false;const key=await crypto.subtle.importKey('raw',new TextEncoder().encode(String(secret)),{name:'HMAC',hash:'SHA-256'},false,['sign']);const sig=await crypto.subtle.sign('HMAC',key,new TextEncoder().encode(`${timestamp}.${raw}`));const expected=[...new Uint8Array(sig)].map(x=>x.toString(16).padStart(2,'0')).join('');return signatures.some(x=>timingSafeEqualHex(expected,x))}
function timingSafeEqualHex(a,b){if(!/^[a-f0-9]+$/i.test(b)||a.length!==b.length)return false;let diff=0;for(let i=0;i<a.length;i++)diff|=a.charCodeAt(i)^b.charCodeAt(i);return diff===0}
async function verifyEd25519(pem,msg,sig){if(!sig)throw new PassportProductError('signature_required',400);let key;try{key=await crypto.subtle.importKey('spki',pemBytes(pem),{name:'Ed25519'},false,['verify'])}catch{throw new PassportProductError('invalid_public_key',422)}let ok=false;try{ok=await crypto.subtle.verify('Ed25519',key,fromBase64url(sig),new TextEncoder().encode(msg))}catch{}if(!ok)throw new PassportProductError('signature_verification_failed',401)}
async function issuerPublicPem(privateJwk){if(!privateJwk?.x)throw new PassportProductError('issuer_public_key_unavailable',503);const publicJwk={kty:'OKP',crv:'Ed25519',x:privateJwk.x,ext:true};const key=await crypto.subtle.importKey('jwk',publicJwk,{name:'Ed25519'},true,['verify']);const spki=new Uint8Array(await crypto.subtle.exportKey('spki',key));const b64=bytesToBase64(spki);return`-----BEGIN PUBLIC KEY-----\n${b64.match(/.{1,64}/g).join('\n')}\n-----END PUBLIC KEY-----`}
function pemBytes(pem){const b=String(pem||'').replace(/-----BEGIN PUBLIC KEY-----|-----END PUBLIC KEY-----|\s/g,'');return base64ToBytes(b)}
function bytesToBase64(bytes){let s='';for(const b of bytes)s+=String.fromCharCode(b);return btoa(s)}
function base64ToBytes(value){const s=atob(String(value||''));return Uint8Array.from(s,c=>c.charCodeAt(0))}
function base64url(bytes){return bytesToBase64(bytes).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'')}
function fromBase64url(value){const s=String(value||'').replace(/-/g,'+').replace(/_/g,'/');return base64ToBytes(s+'='.repeat((4-s.length%4)%4))}
function canonicalize(v){if(v===null||typeof v==='boolean'||typeof v==='string'||typeof v==='number')return JSON.stringify(v);if(Array.isArray(v))return`[${v.map(canonicalize).join(',')}]`;if(typeof v==='object')return`{${Object.keys(v).sort().map(k=>`${JSON.stringify(k)}:${canonicalize(v[k])}`).join(',')}}`;throw new PassportProductError('unsupported_value',400)}
async function sha256Hex(value){const bytes=value instanceof Uint8Array?value:new TextEncoder().encode(String(value));const digest=await crypto.subtle.digest('SHA-256',bytes);return[...new Uint8Array(digest)].map(x=>x.toString(16).padStart(2,'0')).join('')}
function envInt(v,d,min,max){if(v===undefined||v===null||v==='')return d;const n=Number(v);if(!Number.isSafeInteger(n)||n<min||n>max)throw new PassportProductError('integer_out_of_range',500);return n}
function nullableString(v){const s=String(v??'').trim();return s||null}
function nullableInt(v){const n=Number(v);return Number.isSafeInteger(n)&&n>=0?n:null}
function randomHex(n){const b=crypto.getRandomValues(new Uint8Array(n));return[...b].map(x=>x.toString(16).padStart(2,'0')).join('')}
async function bodyJson(request){try{return await request.json()}catch{throw new PassportProductError('request_body_must_be_json',400)}}
function reply(body,status=200){return new Response(JSON.stringify(body),{status,headers:JSON_HEADERS})}
export class PassportProductError extends Error{constructor(message,status=400){super(message);this.status=status}}
