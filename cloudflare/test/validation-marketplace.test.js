import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const validation=await readFile(new URL('../src/validation.js',import.meta.url),'utf8');
const migration=await readFile(new URL('../migrations/0014_validation_marketplace.sql',import.meta.url),'utf8');
const worker=await readFile(new URL('../src/worker.js',import.meta.url),'utf8');
const wrangler=await readFile(new URL('../../wrangler.jsonc',import.meta.url),'utf8');

test('validation marketplace exposes catalog request result and public evidence routes',()=>{
  for(const fragment of ['/api/v1/validation/capabilities','/api/v1/validation/products','/api/v1/validation/requests','/api/v1/validation/results','/evidence']) assert.match(validation,new RegExp(fragment.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')));
  assert.match(worker,/handleValidation/);
  assert.match(wrangler,/\/api\/v1\/validation\/\*/);
});

test('payment buys an assessment but cannot buy a positive outcome',()=>{
  assert.match(validation,/Payment buys an assessment, never a positive result/);
  assert.match(validation,/OUTCOMES=\['passed','failed','inconclusive'\]/);
  assert.match(validation,/evidence_digest_required_for_passed_result/);
  assert.match(validation,/trust_score:null/);
  assert.doesNotMatch(validation,/trust_score\s*:\s*[1-9]/);
});

test('one payment order can fund only one validation request',()=>{
  assert.match(migration,/payment_order_id TEXT NOT NULL UNIQUE/);
  assert.match(validation,/payment_status='payment_authorized'/);
  assert.match(validation,/payment_status='consumed'/);
  assert.match(validation,/INSERT INTO validation_requests[\s\S]+FROM service_orders[\s\S]+payment_status='payment_authorized'/);
  assert.match(validation,/EXISTS \(SELECT 1 FROM validation_requests WHERE id=\?3 AND payment_order_id=\?2\)/);
});

test('validators must have an active unique recovery-key safety profile',()=>{
  assert.match(validation,/validator_safety_profile_not_active/);
  assert.match(validation,/validator_recovery_key_not_unique/);
  assert.match(validation,/attestor_safety_profiles/);
  assert.match(validation,/recovery_key_fingerprint/);
});

test('products requests and results are Ed25519 signed under distinct domains',()=>{
  for(const domain of ['accordtrace.validation.product.v1','accordtrace.validation.request.v1','accordtrace.validation.result.v1']) assert.match(validation,new RegExp(domain.replaceAll('.','\\.')));
  assert.match(validation,/verifyEd25519/);
  assert.match(migration,/validation_result_signatures/);
});

test('non-domain subject references are digest-only in public request evidence',()=>{
  assert.match(validation,/accordtrace\.validation\.subject_ref\.v1/);
  assert.match(validation,/function publicSubjectRef\(type,v\)\{return type==='domain_control'\?v:null;\}/);
  assert.match(migration,/subject_ref_digest TEXT/);
});

test('AccordTrace remains non-custodial in validation payments',()=>{
  assert.match(validation,/custody:'none'/);
  assert.doesNotMatch(validation,/sendTransaction|eth_sendTransaction|private_key|seed_phrase/i);
});
