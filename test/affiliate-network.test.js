import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { handleAffiliate } from '../cloudflare/src/affiliate.js';

const read=p=>fs.readFileSync(new URL(`../${p}`,import.meta.url),'utf8');

test('affiliate capabilities expose one-level product referral without live payouts',async()=>{
  const response=await handleAffiliate(new Request('https://example.test/api/v1/network/capabilities'),{},new URL('https://example.test/api/v1/network/capabilities'));
  assert.equal(response.status,200);
  const body=await response.json();
  assert.equal(body.model,'single_level_direct_product_referral');
  assert.equal(body.passport_price.amount_atomic,200);
  assert.equal(body.direct_commission.amount_atomic,100);
  assert.equal(body.cash_payouts_enabled,false);
  assert.match(body.legal_boundary,/standalone product/i);
  assert.ok(body.rules.includes('no_multilevel_downline_commission'));
  assert.ok(body.rules.includes('no_self_referral'));
  assert.ok(body.rules.includes('referral_activity_never_increases_trust_or_validation_status'));
});

test('affiliate schema is direct-only, replay bounded and reversal aware',()=>{
  const sql=read('cloudflare/migrations/0020_agent_affiliate_network.sql');
  assert.match(sql,/referred_passport_id TEXT NOT NULL UNIQUE/);
  assert.match(sql,/CHECK\(referrer_passport_id <> referred_passport_id\)/);
  assert.match(sql,/affiliate_request_nonces/);
  assert.match(sql,/affiliate_ledger_events/);
  assert.match(sql,/reversed/);
  assert.doesNotMatch(sql,/parent_referrer|upline|downline|level_2|level_3/i);
});

test('network is Worker-first and scheduled maturity is wired',()=>{
  const worker=read('cloudflare/src/worker.js');
  const wrangler=read('wrangler.jsonc');
  assert.match(worker,/handleAffiliate/);
  assert.match(worker,/matureAffiliateCommissions/);
  assert.match(wrangler,/\/api\/v1\/network\/\*/);
});

test('network core does not expose a public payout action',()=>{
  const src=read('cloudflare/src/affiliate.js');
  assert.match(src,/cash_payouts_enabled:false/);
  assert.match(src,/ledger_only_until_payout_provider_kyc_tax_and_terms_review_are_complete/);
  assert.doesNotMatch(src,/\/payouts\/send|\/withdraw|wallet_private_key|seed_phrase/i);
  assert.match(src,/self_referral_not_allowed/);
  assert.match(src,/shared_payment_identity_review/);
  assert.match(src,/reciprocal_referral_review/);
});
