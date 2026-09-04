import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { handlePassportProduct } from '../cloudflare/src/passport-product.js';

const source=fs.readFileSync(new URL('../cloudflare/src/passport-product.js',import.meta.url),'utf8');
const settlement=fs.readFileSync(new URL('../cloudflare/src/affiliate-settlement.js',import.meta.url),'utf8');
const migration=fs.readFileSync(new URL('../cloudflare/migrations/0021_passport_certificate_commerce.sql',import.meta.url),'utf8');
const worker=fs.readFileSync(new URL('../cloudflare/src/worker.js',import.meta.url),'utf8');

test('Passport Certificate launch policy is $2 and disabled until every commercial gate exists',async()=>{
  const request=new Request('https://accordtrace.test/api/v1/passport-product/capabilities');
  let response=await handlePassportProduct(request,{},new URL(request.url));
  let body=await response.json();
  assert.equal(body.product.price.amount_atomic,200);
  assert.equal(body.product.price.currency,'usd');
  assert.equal(body.commercial_ready,false);
  assert.equal(body.cryptographic_passport_registration,'available_separately');
  assert.equal(body.affiliate_enrollment,'optional_and_separate');
  response=await handlePassportProduct(request,{STRIPE_SECRET_KEY:'sk_test',STRIPE_PRICE_AGENT_PASSPORT:'price_test',STRIPE_WEBHOOK_SECRET:'whsec_test',NOTARY_PRIVATE_JWK:'{}',PASSPORT_PRODUCT_PRICE_ATOMIC:'200',AFFILIATE_PASSPORT_PRICE_ATOMIC:'300'},new URL(request.url));
  body=await response.json();
  assert.equal(body.referral_pricing_consistent,false);
  assert.equal(body.commercial_ready,false);
});

test('dedicated Passport product tables cannot be confused with validation orders',()=>{
  assert.match(migration,/CREATE TABLE IF NOT EXISTS passport_product_orders/);
  assert.match(migration,/CREATE TABLE IF NOT EXISTS agent_passport_certificates/);
  assert.match(migration,/passport_product_stripe_events/);
  assert.doesNotMatch(migration,/stripe_validation_orders/);
  assert.match(migration,/checkout_request_id TEXT NOT NULL UNIQUE/);
  assert.match(migration,/WHERE payment_status IN \('created','pending','paid','review','fulfilled'\)/);
});

test('checkout is server-side, fixed-price and signed by the active Passport',()=>{
  assert.match(source,/accordtrace\.passport-product\.checkout\.v1/);
  assert.match(source,/verifyEd25519/);
  assert.match(source,/STRIPE_PRICE_AGENT_PASSPORT/);
  assert.match(source,/line_items\[0\]\[price\]/);
  assert.match(source,/idempotency-key/);
  assert.match(source,/success_url/);
  assert.match(source,/Browser redirects and validation-product payments cannot fulfill this product/i);
  assert.doesNotMatch(source,/card_number|\bcvc\b|payment_method_data\[card\]/i);
});

test('webhook verifies untouched raw Stripe body before parsing and uses a dedicated event ledger',()=>{
  const raw=source.indexOf("const raw=await request.text()");
  const verified=source.indexOf('verifyStripeSignature(raw');
  const parsed=source.indexOf('JSON.parse(raw)');
  assert.ok(raw>=0&&verified>raw&&parsed>verified);
  assert.match(source,/passport_product_stripe_events/);
  assert.match(source,/processed_at/);
  assert.match(source,/processing_error/);
});

test('only exact Passport product economics can fulfill and qualify direct referral',()=>{
  assert.match(source,/amount!==policy\.priceAtomic\|\|currency!==policy\.currency/);
  assert.match(source,/paid_amount_or_currency_mismatch/);
  assert.match(source,/qualifyDirectAffiliateSale/);
  assert.match(source,/passport-product:\$\{order\.id\}/);
  assert.match(settlement,/no_referral_attribution/);
  assert.match(settlement,/qualifying_direct_sale/);
  assert.match(settlement,/shared_payment_identity_review/);
  assert.match(settlement,/referrer_profile_inactive_review/);
});

test('refunds and chargebacks preserve evidence while reversing unpaid referral settlement',()=>{
  assert.match(source,/charge\.refunded/);
  assert.match(source,/charge\.dispute\.created/);
  assert.match(source,/UPDATE agent_passport_certificates SET state='refunded'/);
  assert.match(source,/reverseDirectAffiliateSale/);
  assert.match(settlement,/paid_commission_requires_manual_recovery_review/);
});

test('certificate verification requires a valid AccordTrace issuer signature',async()=>{
  const keys=await crypto.subtle.generateKey({name:'Ed25519'},true,['sign','verify']);
  const privateJwk=await crypto.subtle.exportKey('jwk',keys.privateKey);
  const spki=new Uint8Array(await crypto.subtle.exportKey('spki',keys.publicKey));
  const publicPem=pem(spki);
  const unsigned={schema:'accordtrace.agent-passport-certificate.v1',id:'atpc_0123456789abcdef0123456789abcdef',passport_id:'agtp_test',public_key_fingerprint:'sha256:abc',product:{id:'agent_passport_certificate',version:'1',price_at_issue:{amount_atomic:200,currency:'usd'}},issued_at:new Date().toISOString(),certificate_url:'https://accordtrace.test/cert',verification_endpoint:'https://accordtrace.test/api/v1/passport-product/certificates/verify',scope:'test'};
  const signature=await crypto.subtle.sign('Ed25519',keys.privateKey,new TextEncoder().encode(canonicalize(unsigned)));
  const certificate={...unsigned,issuer:{name:'AccordTrace',algorithm:'Ed25519',public_key:publicPem,signature:Buffer.from(signature).toString('base64url')}};
  const request=new Request('https://accordtrace.test/api/v1/passport-product/certificates/verify',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({certificate})});
  const response=await handlePassportProduct(request,{NOTARY_PRIVATE_JWK:JSON.stringify(privateJwk)},new URL(request.url));
  const body=await response.json();
  assert.equal(response.status,200);
  assert.equal(body.valid,true);
  assert.ok(body.checks.every(check=>check.passed));
});

test('Worker exposes dedicated Passport product router before legacy fallback',()=>{
  assert.match(worker,/handlePassportProduct/);
  assert.ok(worker.indexOf('handlePassportProduct(request,env,url)')<worker.indexOf('return legacyWorker.fetch'));
});

function canonicalize(v){if(v===null||typeof v==='boolean'||typeof v==='string'||typeof v==='number')return JSON.stringify(v);if(Array.isArray(v))return`[${v.map(canonicalize).join(',')}]`;return`{${Object.keys(v).sort().map(k=>`${JSON.stringify(k)}:${canonicalize(v[k])}`).join(',')}}`}
function pem(bytes){const b64=Buffer.from(bytes).toString('base64');return`-----BEGIN PUBLIC KEY-----\n${b64.match(/.{1,64}/g).join('\n')}\n-----END PUBLIC KEY-----`}
