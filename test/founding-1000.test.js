import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const source=fs.readFileSync(new URL('../cloudflare/src/founding-1000.js',import.meta.url),'utf8');
const migration=fs.readFileSync(new URL('../cloudflare/migrations/0030_founding_1000_passports.sql',import.meta.url),'utf8');
const worker=fs.readFileSync(new URL('../cloudflare/src/worker.js',import.meta.url),'utf8');

test('Founding 1000 is hard-capped at exactly 1000 durable slots',()=>{
  assert.match(migration,/CHECK\(slot BETWEEN 1 AND 1000\)/);
  assert.match(migration,/SELECT n \+ 1 FROM slots WHERE n < 1000/);
  assert.match(migration,/SELECT 'founding_1000_202609', n, 'available' FROM slots/);
  assert.match(migration,/UNIQUE\(campaign, passport_id\)/);
  assert.match(source,/const LIMIT=1000/);
  assert.match(source,/state='available'.*ORDER BY slot LIMIT 1/s);
});

test('Founding grant is cryptographically claimed by an active Passport',()=>{
  assert.match(source,/accordtrace\.passport-product\.founding-1000\.claim\.v1/);
  assert.match(source,/SELECT id,public_key,status FROM agent_passports/);
  assert.match(source,/row\.status!==['"]active['"]/);
  assert.match(source,/verifyEd25519\(passport\.public_key/);
  assert.match(source,/one_grant_per_passport:true/);
  assert.match(source,/unique_human_or_company_claim:false/);
});

test('Founding grant is economically isolated from paid sales and referrals',()=>{
  assert.match(migration,/fulfillment_source TEXT NOT NULL DEFAULT 'stripe'/);
  assert.match(source,/'founding_grant'/);
  assert.match(source,/payment_status.*'fulfilled'.*amount_total.*0/s);
  assert.match(source,/referral_commission_for_free_grant:\{amount_atomic:0/);
  assert.match(source,/commission_eligible:false/);
  assert.match(source,/promotional_grant_no_paid_sale/);
  assert.doesNotMatch(source,/qualifyDirectAffiliateSale|reverseDirectAffiliateSale/);
});

test('Founding certificate is visibly marked and keeps standard post-campaign price separate',()=>{
  assert.match(migration,/issuance_tier TEXT NOT NULL DEFAULT 'standard'/);
  assert.match(migration,/founding_ordinal INTEGER/);
  assert.match(source,/issuance:\{tier:'founding'/);
  assert.match(source,/price_at_issue:\{amount_atomic:0/);
  assert.match(source,/standard_price_after_campaign:standard/);
  assert.match(source,/consideration:'promotional_grant_no_payment'/);
});

test('Founding route is handled before normal paid Passport product route',()=>{
  const foundingImport=worker.indexOf('handleFounding1000');
  const foundingRoute=worker.indexOf('handleFounding1000(request,env,url)');
  const paidRoute=worker.indexOf('handlePassportProduct(request,env,url)');
  assert.ok(foundingImport>=0);
  assert.ok(foundingRoute>=0&&paidRoute>foundingRoute);
});

test('abandoned reservations can return to the pool without touching issued slots',()=>{
  assert.match(source,/state='reserved'.*order_id IS NULL.*certificate_id IS NULL.*julianday\('now','-1 hour'\)/s);
  assert.match(source,/state='available'/);
  assert.match(source,/state='issued'/);
});
