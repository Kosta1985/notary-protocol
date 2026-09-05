import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import { createHmac } from 'node:crypto';
import { handlePassportProduct } from '../cloudflare/src/passport-product.js';
import { passportSafeEnv, passportSignerState } from '../cloudflare/src/passport-signer-readiness.js';

// In-memory SQLite and generated test keys only. Every Stripe call is stubbed.
// These regression tests do NOT claim to be a real Stripe sandbox purchase.
const origin='https://accordtrace.test';
const prefix='/api/v1/passport-product';
const canonical=v=>v===null||typeof v!=='object'?JSON.stringify(v):Array.isArray(v)?`[${v.map(canonical).join(',')}]`:`{${Object.keys(v).sort().map(k=>`${JSON.stringify(k)}:${canonical(v[k])}`).join(',')}}`;
async function keys(){const pair=await crypto.subtle.generateKey({name:'Ed25519'},true,['sign','verify']);return{pair,private:await crypto.subtle.exportKey('jwk',pair.privateKey),public:await crypto.subtle.exportKey('jwk',pair.publicKey)}}
async function pem(key){const b64=Buffer.from(await crypto.subtle.exportKey('spki',key)).toString('base64');return`-----BEGIN PUBLIC KEY-----\n${b64.match(/.{1,64}/g).join('\n')}\n-----END PUBLIC KEY-----`}
function d1(sqlite){return{
  prepare(sql){let args=[];const query=()=>{const stmt=sqlite.prepare(sql);const parameters=Object.fromEntries(args.map((v,i)=>[String(i+1),v]));return{stmt,parameters}};return{
    bind(...values){args=values;return this},
    async first(){const{stmt,parameters}=query();return stmt.get(parameters)||null},
    async all(){const{stmt,parameters}=query();return{results:stmt.all(parameters)}},
    async run(){const{stmt,parameters}=query();const out=stmt.run(parameters);return{meta:{changes:Number(out.changes)},success:true}}
  }},
  async batch(statements){sqlite.exec('BEGIN');try{const out=[];for(const statement of statements)out.push(await statement.run());sqlite.exec('COMMIT');return out}catch(error){sqlite.exec('ROLLBACK');throw error}}
}}
async function setup(t,{referral=false,proofSigner=false}={}){
  const db=new DatabaseSync(':memory:');
  t.after(()=>db.close());
  for(const file of ['0005_agent_security.sql','0020_agent_affiliate_network.sql','0021_passport_certificate_commerce.sql'])db.exec(fs.readFileSync(new URL(`../cloudflare/migrations/${file}`,import.meta.url),'utf8'));
  const issuer=await keys(),buyer=await keys(),referrer=await keys();
  const now=new Date().toISOString();
  for(const [id,key] of [['agtp_buyer',buyer],['agtp_referrer',referrer]])db.prepare('INSERT INTO agent_passports(id,public_key,last_signed_at,created_at,updated_at) VALUES(?,?,?,?,?)').run(id,await pem(key.pair.publicKey),now,now,now);
  if(referral){
    db.prepare("INSERT INTO affiliate_profiles(passport_id,referral_code,terms_version,enrollment_request_id,accepted_at,created_at,updated_at) VALUES('agtp_referrer','atr_0123456789abcdef','1','enroll1',?,?,?)").run(now,now,now);
    db.prepare("INSERT INTO affiliate_attributions(id,referrer_passport_id,referred_passport_id,referral_code,attributed_at,created_at,updated_at) VALUES('attr_test','agtp_referrer','agtp_buyer','atr_0123456789abcdef',?,?,?)").run(now,now,now);
  }
  const env={DB:d1(db),STRIPE_SECRET_KEY:'sk_test_simulation_only',STRIPE_PRICE_AGENT_PASSPORT:'price_simulation',STRIPE_WEBHOOK_SECRET:'whsec_local_simulation_only',PASSPORT_CHECKOUT_ENABLED:'true'};
  if(proofSigner){env.PASSPORT_USE_PROOF_SIGNER='true';env.PROOF_SIGNING_PRIVATE_JWK=JSON.stringify(issuer.private);env.PROOF_SIGNING_PUBLIC_JWK=JSON.stringify(issuer.public)}else env.NOTARY_PRIVATE_JWK=JSON.stringify(issuer.private);
  const calls=[];let session;
  const originalFetch=globalThis.fetch;
  t.after(()=>{globalThis.fetch=originalFetch});
  globalThis.fetch=async(url,init={})=>{
    assert.match(String(url),/^https:\/\/api\.stripe\.com\/v1\//,'No unapproved outbound destination');calls.push({url:String(url),method:init.method||'GET'});
    if(init.method==='POST'){
      assert.equal(String(url),'https://api.stripe.com/v1/checkout/sessions');
      const form=new URLSearchParams(init.body);assert.equal(form.get('line_items[0][price]'),'price_simulation');
      session={id:'cs_test_simulation1',url:'https://checkout.stripe.com/c/pay/cs_test_simulation1',livemode:false,mode:'payment',payment_status:'unpaid',amount_total:200,currency:'usd',payment_intent:'pi_simulation1',customer:'cus_simulation1',client_reference_id:form.get('client_reference_id'),metadata:Object.fromEntries([...form].filter(([key])=>/^metadata\[/.test(key)).map(([key,value])=>[key.slice(9,-1),value]))};
      return Response.json(session);
    }
    if(String(url)==='https://api.stripe.com/v1/payment_intents/pi_simulation1')return Response.json({id:'pi_simulation1',livemode:false,metadata:session.metadata});
    if(String(url)==='https://api.stripe.com/v1/checkout/sessions/cs_test_simulation1')return Response.json({...session,payment_status:'paid'});
    throw new Error('Unmocked Stripe request');
  };
  async function call(path,body){const request=new Request(origin+prefix+path,{...(body===undefined?{}:{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(body)})});const response=await handlePassportProduct(request,env);return{status:response.status,body:await response.json()}}
  const signed={request_id:'request_test',passport_id:'agtp_buyer',requested_at:now,referral_code:referral?'atr_0123456789abcdef':null};
  const payload={domain:'accordtrace.passport-product.checkout.v1',...signed,product_id:'agent_passport_certificate',product_version:'1'};
  signed.signature=Buffer.from(await crypto.subtle.sign('Ed25519',buyer.pair.privateKey,new TextEncoder().encode(canonical(payload)))).toString('base64url');
  async function checkout(){return call('/checkout',signed)}
  async function event(type,object,options={}){
    const body=JSON.stringify({id:options.id||'evt_simulation1',type,livemode:options.live??false,data:{object}});
    const timestamp=Math.floor(Date.now()/1000)+(options.offset||0);
    const sig=createHmac('sha256',options.badSecret?'wrong_secret':env.STRIPE_WEBHOOK_SECRET).update(`${timestamp}.${body}`).digest('hex');
    const response=await handlePassportProduct(new Request(origin+prefix+'/stripe/webhook',{method:'POST',headers:{'content-type':'application/json','stripe-signature':`t=${timestamp},v1=${sig}`},body}),env);
    return{status:response.status,body:await response.json()};
  }
  return{db,env,issuer,call,checkout,event,calls,session:()=>({...session,payment_status:'paid'}),count:table=>db.prepare(`SELECT COUNT(*) AS n FROM ${table}`).get().n,order:()=>db.prepare('SELECT * FROM passport_product_orders').get()};
}

test('existing proof signer requires opt-in and a matching real key pair',async()=>{
  const key=await keys();const env={PROOF_SIGNING_PRIVATE_JWK:JSON.stringify(key.private),PROOF_SIGNING_PUBLIC_JWK:JSON.stringify(key.public)};
  assert.equal((await passportSafeEnv(env)).NOTARY_PRIVATE_JWK,undefined);
  const safe=await passportSafeEnv({...env,PASSPORT_USE_PROOF_SIGNER:'true'});
  assert.equal(passportSignerState(safe).valid,true);assert.equal(passportSignerState(safe).source,'PROOF_SIGNING_PRIVATE_JWK');
  assert.match(passportSignerState(safe).public_key_fingerprint,/^sha256:[a-f0-9]{64}$/);
  assert.equal(env.NOTARY_PRIVATE_JWK,undefined,'Original binding is never mutated');
});
test('malformed explicit primary signer cannot fall back to the proof key',async()=>{
  const key=await keys();const safe=await passportSafeEnv({NOTARY_PRIVATE_JWK:'{}',PROOF_SIGNING_PRIVATE_JWK:JSON.stringify(key.private),PASSPORT_USE_PROOF_SIGNER:'true'});
  assert.equal(safe.NOTARY_PRIVATE_JWK,undefined);assert.equal(passportSignerState(safe).source,'NOTARY_PRIVATE_JWK');
});
test('matching-length but inconsistent private/public key material fails actual crypto validation',async()=>{
  const first=await keys(),second=await keys();const safe=await passportSafeEnv({NOTARY_PRIVATE_JWK:JSON.stringify({...first.private,x:second.public.x})});
  assert.equal(passportSignerState(safe).valid,false);assert.equal(safe.NOTARY_PRIVATE_JWK,undefined);
});
test('configured proof public key mismatch fails closed',async()=>{
  const first=await keys(),second=await keys();const safe=await passportSafeEnv({PASSPORT_USE_PROOF_SIGNER:'true',PROOF_SIGNING_PRIVATE_JWK:JSON.stringify(first.private),PROOF_SIGNING_PUBLIC_JWK:JSON.stringify(second.public)});
  assert.equal(passportSignerState(safe).reason,'public_key_mismatch');assert.equal(safe.NOTARY_PRIVATE_JWK,undefined);
});
test('private signer with only verify key_ops is not considered ready',async()=>{
  const key=await keys();const safe=await passportSafeEnv({NOTARY_PRIVATE_JWK:JSON.stringify({...key.private,key_ops:['verify']})});assert.equal(passportSignerState(safe).valid,false);
});
test('signer cache detects changed secret material without changing the old environment',async()=>{
  const key=await keys();const env={NOTARY_PRIVATE_JWK:JSON.stringify(key.private)};
  assert.equal(passportSignerState(await passportSafeEnv(env)).valid,true);env.NOTARY_PRIVATE_JWK='{}';assert.equal(passportSignerState(await passportSafeEnv(env)).valid,false);
});
test('capabilities expose only safe diagnostics; checkout needs separate explicit activation',async t=>{
  const h=await setup(t,{proofSigner:true});delete h.env.PASSPORT_CHECKOUT_ENABLED;
  const c=await h.call('/capabilities');assert.equal(c.body.certificate_signing_enabled,true);assert.equal(c.body.commercial_ready,false);assert.equal(c.body.checkout_activation_enabled,false);
  assert.equal(JSON.stringify(c.body).includes(h.issuer.private.d),false);
  const checkout=await h.checkout();assert.equal(checkout.status,503);assert.equal(h.calls.length,0);assert.equal(h.count('passport_product_orders'),0);
});
test('signed checkout is idempotent and cannot issue a certificate before a webhook',async t=>{
  const h=await setup(t);const first=await h.checkout(),second=await h.checkout();assert.equal(first.status,201);assert.equal(second.body.idempotent,true);assert.equal(h.calls.length,1);assert.equal(h.count('passport_product_orders'),1);assert.equal(h.count('agent_passport_certificates'),0);
});
test('verified payment fulfills one certificate and one direct US$1 ledger commission',async t=>{
  const h=await setup(t,{referral:true,proofSigner:true});await h.checkout();const event=await h.event('checkout.session.completed',h.session());
  assert.equal(event.status,200);assert.equal(event.body.status,'fulfilled');assert.equal(h.order().payment_status,'fulfilled');assert.equal(h.count('agent_passport_certificates'),1);
  const commission=h.db.prepare('SELECT * FROM affiliate_commissions').get();assert.equal(commission.amount_atomic,100);assert.equal(commission.state,'pending');
  const cert=JSON.parse(h.db.prepare('SELECT certificate_json FROM agent_passport_certificates').get().certificate_json);
  const check=await h.call('/certificates/verify',{certificate:cert});assert.equal(check.body.valid,true);
  const duplicate=await h.event('checkout.session.completed',h.session());assert.equal(duplicate.body.duplicate,true);
  await h.event('checkout.session.completed',h.session(),{id:'evt_same_payment_other_delivery'});
  assert.equal(h.count('agent_passport_certificates'),1);assert.equal(h.count('affiliate_commissions'),1);assert.equal(h.count('affiliate_ledger_events'),1);
});
test('a purchase without attribution issues no affiliate commission',async t=>{const h=await setup(t);await h.checkout();await h.event('checkout.session.completed',h.session());assert.equal(h.count('agent_passport_certificates'),1);assert.equal(h.count('affiliate_commissions'),0)});
test('unsigned or stale webhook cannot write the event ledger or issue certificates',async t=>{
  const h=await setup(t);await h.checkout();for(const options of [{badSecret:true},{offset:-600}]){const event=await h.event('checkout.session.completed',h.session(),options);assert.equal(event.status,400)}
  assert.equal(h.count('passport_product_stripe_events'),0);assert.equal(h.count('agent_passport_certificates'),0);
});
test('a test-mode event cannot be processed as a live payment',async t=>{
  const h=await setup(t);await h.checkout();h.env.STRIPE_SECRET_KEY='sk_live_not_a_real_key';const event=await h.event('checkout.session.completed',h.session());assert.equal(event.status,400);assert.equal(event.body.error,'stripe_event_mode_mismatch');assert.equal(h.count('passport_product_stripe_events'),0);
});
test('validly signed event for a different Checkout session cannot fulfill or cancel this order',async t=>{
  const h=await setup(t);await h.checkout();for(const type of ['checkout.session.completed','checkout.session.expired']){const event=await h.event(type,{...h.session(),id:'cs_test_wrong'},{id:type});assert.equal(event.body.reason,'stripe_checkout_session_mismatch')}
  assert.equal(h.order().payment_status,'pending');assert.equal(h.count('agent_passport_certificates'),0);
});
test('wrong passport or product metadata is not allowed to fulfill an order',async t=>{
  const h=await setup(t);await h.checkout();const session=h.session();const event=await h.event('checkout.session.completed',{...session,metadata:{...session.metadata,passport_id:'agtp_other'}});assert.equal(event.body.reason,'stripe_product_metadata_mismatch');assert.equal(h.order().payment_status,'pending');
});
test('incorrect amount or currency requires review without a certificate or commission',async t=>{
  const h=await setup(t,{referral:true});await h.checkout();const event=await h.event('checkout.session.completed',{...h.session(),amount_total:100,currency:'aud'});assert.equal(event.body.status,'review');assert.equal(h.count('agent_passport_certificates'),0);assert.equal(h.count('affiliate_commissions'),0);
});
test('delayed payment waits for a verified asynchronous success',async t=>{
  const h=await setup(t);await h.checkout();await h.event('checkout.session.completed',{...h.session(),payment_status:'unpaid'});assert.equal(h.order().payment_status,'pending');assert.equal(h.count('agent_passport_certificates'),0);
  await h.event('checkout.session.async_payment_succeeded',h.session(),{id:'evt_async'});assert.equal(h.order().payment_status,'fulfilled');
});
test('expired Checkout ends unpaid and creates no certificate',async t=>{const h=await setup(t);await h.checkout();await h.event('checkout.session.expired',h.session());assert.equal(h.order().payment_status,'failed');assert.equal(h.count('agent_passport_certificates'),0)});
test('refund reverses unpaid commission once and a delayed completed event cannot revive it',async t=>{
  const h=await setup(t,{referral:true});await h.checkout();await h.event('checkout.session.completed',h.session());
  const refund={id:'ch_simulation',payment_intent:'pi_simulation1',amount_refunded:200};
  await h.event('charge.refunded',refund,{id:'evt_refund'});await h.event('charge.refunded',refund,{id:'evt_refund_second'});
  const late=await h.event('checkout.session.completed',h.session(),{id:'evt_late'});
  assert.equal(late.body.reason,'order_not_fulfillable');assert.equal(h.order().payment_status,'refunded');assert.equal(h.db.prepare('SELECT state FROM agent_passport_certificates').get().state,'refunded');assert.equal(h.db.prepare('SELECT state FROM affiliate_commissions').get().state,'reversed');assert.equal(h.count('affiliate_ledger_events'),2);
});
test('refund arriving before checkout completion is reconciled and blocks later issuance',async t=>{
  const h=await setup(t,{referral:true});await h.checkout();const reversed=await h.event('charge.refunded',{payment_intent:'pi_simulation1'},{id:'evt_early_refund'});assert.equal(reversed.body.status,'refunded');
  await h.event('checkout.session.completed',h.session());assert.equal(h.order().payment_status,'refunded');assert.equal(h.count('agent_passport_certificates'),0);assert.equal(h.count('affiliate_commissions'),0);assert.equal(h.calls.filter(c=>c.method==='GET').length,2);
});
test('dispute arriving before checkout completion cannot be followed by certificate issuance',async t=>{
  const h=await setup(t);await h.checkout();await h.event('charge.dispute.created',{payment_intent:'pi_simulation1'},{id:'evt_early_dispute'});await h.event('checkout.session.completed',h.session());assert.equal(h.order().payment_status,'chargeback');assert.equal(h.count('agent_passport_certificates'),0);
});
