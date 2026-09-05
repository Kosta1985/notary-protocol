import test from 'node:test';
import assert from 'node:assert/strict';
import { classifyReference, requestJson, lookupEvidence, loadPassportEvidence, safeLocalLink, publicErrorMessage } from '../web/public-evidence.js';
const passport = 'agtp_' + 'a'.repeat(64);
const proof = 'atp_' + 'b'.repeat(32);
const receipt = 'ntr_' + 'c'.repeat(24);
const certificate = 'atpc_' + 'd'.repeat(32);
const json = (data, status = 200) => Response.json(data, { status });
const failed = code => error => error.code === code;

test('public verifier recognizes current proof, certificate, Passport and legacy receipt IDs', () => {
  assert.equal(classifyReference(passport).kind, 'passport');
  assert.equal(classifyReference(proof).kind, 'proof');
  assert.equal(classifyReference(certificate).kind, 'certificate');
  assert.equal(classifyReference(receipt).kind, 'receipt');
  assert.equal(classifyReference('request:external-1').kind, 'validation');
});
test('referral and order IDs cannot masquerade as evidence', () => {
  for (const id of ['atr_1234567890123456', 'atpo_' + '0'.repeat(32), 'stpo_' + '0'.repeat(32)]) assert.throws(() => classifyReference(id), failed('not_evidence_reference'));
});
test('invalid, oversized and URL references fail before network access', async () => {
  for (const value of ['', 'atp_bad', 'agtp_a', 'ntr_short', 'https://evil.test/x', '../private', 'x'.repeat(201)]) {
    let calls = 0;
    await assert.rejects(lookupEvidence(value, { fetchImpl: () => { calls += 1; throw Error('must not call'); } }));
    assert.equal(calls, 0);
  }
});
test('legacy receipt 404 is not returned as successful null evidence', async () => {
  const paths = [];
  await assert.rejects(lookupEvidence(receipt, { fetchImpl: async path => { paths.push(path); return json({error:'not_found'},404); } }), failed('not_found'));
  assert.deepEqual(paths, ['/v1/receipts/' + receipt]);
});
test('proof verification calls the current read-only verifier, not validation or obsolete receipts', async () => {
  const calls = [];
  const result = await lookupEvidence(proof, { fetchImpl: async (path, init) => {
    calls.push({path,method:init.method,body:JSON.parse(init.body)});
    return json({proof_id:proof,valid:true,integrity_mode:'issuer_signed_hash',signature_valid:true});
  }});
  assert.deepEqual(calls, [{path:'/api/v1/verify',method:'POST',body:{proof_id:proof}}]);
  assert.equal(result.outcome, 'verified');
  assert.match(result.description,/does not compare/);
});
test('unsigned proof is explicitly service-recorded, never signature-verified', async () => {
  const result = await lookupEvidence(proof, { fetchImpl: async () => json({proof_id:proof,valid:true,integrity_mode:'service_recorded_hash',signature_valid:null}) });
  assert.equal(result.outcome,'record');assert.match(result.title,/no issuer signature/);
});
test('failed proof signature is a failed verification even on HTTP 200', async () => {
  const result = await lookupEvidence(proof, { fetchImpl: async () => json({proof_id:proof,valid:false,integrity_mode:'issuer_signed_hash',signature_valid:false}) });
  assert.equal(result.outcome,'invalid');
});
test('mismatched IDs and contradictory proof verification are rejected', async () => {
  for(const value of [{proof_id:'wrong',valid:true},{proof_id:proof,valid:'true'},{proof_id:proof,valid:true,integrity_mode:'issuer_signed_hash',signature_valid:null}]) {
    await assert.rejects(lookupEvidence(proof,{fetchImpl:async()=>json(value)}),failed('invalid_response'));
  }
});
test('Certificate lookup verifies signature and keeps revoked state separate', async () => {
  const result = await lookupEvidence(certificate,{fetchImpl:async(path,init)=>path.endsWith('/verify')?json({certificate_id:certificate,valid:true}):json({certificate:{id:certificate,issuer:{}},state:'revoked'})});
  assert.equal(result.outcome,'record');assert.match(result.title,/Historical signature verified - revoked/);
});
test('Certificate verification HTTP 422 stays negative instead of becoming a connectivity error', async () => {
  const result = await lookupEvidence(certificate,{fetchImpl:async path=>path.endsWith('/verify')?json({certificate_id:certificate,valid:false},422):json({certificate:{id:certificate,issuer:{}},state:'active'})});
  assert.equal(result.outcome,'invalid');
});
test('receipt signature check cannot imply a positive underlying verification outcome', async () => {
  const result = await lookupEvidence(receipt,{fetchImpl:async path=>path.endsWith('/verify')?json({receiptId:receipt,valid:true}):json({id:receipt,valid:false,notary:{}})});
  assert.equal(result.data.receipt.valid,false);assert.match(result.description,/not a positive outcome/);
});
test('validation record lookup does not claim to cryptographically verify it', async () => {
  const result = await lookupEvidence('vreq_example',{fetchImpl:async()=>json({validation_request:{id:'vreq_example',status:'pending'}})});
  assert.equal(result.outcome,'record');assert.match(result.description,/not an independent verification/);
});
test('malformed success responses never imply evidence, including null, arrays and error objects', async () => {
  for(const value of [null,[],{}, {error:'secret internal detail'}]){
    await assert.rejects(lookupEvidence('vreq_example',{fetchImpl:async()=>json(value)}),failed('invalid_response'));
  }
});
test('non-JSON successful response fails closed', async () => {
  await assert.rejects(requestJson('/api/v1/security/capabilities',{fetchImpl:async()=>new Response('<html>not JSON</html>',{headers:{'content-type':'text/html'}})}),failed('invalid_response'));
});
test('timeouts stop the request and are bounded', async () => {
  await assert.rejects(requestJson('/api/v1/security/capabilities',{timeoutMs:10,fetchImpl:(_path,{signal})=>new Promise((resolve,reject)=>signal.addEventListener('abort',()=>reject(new Error('aborted'))))}),failed('timeout'));
});
test('caller cancellation stops requests and remains distinguishable from timeouts', async () => {
  const c=new AbortController();c.abort();let calls=0;
  await assert.rejects(requestJson('/api/v1/security/capabilities',{signal:c.signal,fetchImpl:()=>{calls++;}}),failed('cancelled'));assert.equal(calls,0);
});
test('raw provider errors and internal strings never become public UI messages', async () => {
  let caught;
  try { await requestJson('/api/v1/security/capabilities',{fetchImpl:async()=>json({error:'DB SQL internal secret=123'},500)}); } catch(error) {caught=error;}
  assert.equal(caught.code,'unavailable');assert.doesNotMatch(publicErrorMessage(caught),/SQL|secret=123/);
  assert.doesNotMatch(publicErrorMessage(new Error('secret=456')),/secret/);
});
test('supplemental Passport outage retains primary evidence with explicit warning, not fabricated zero', async () => {
  const result=await loadPassportEvidence(passport,{fetchImpl:async path=>path.includes('/security/passports/')?json({passport:{id:passport,status:'active'}}):path.includes('/validation/')?json({error:'temporarily_unavailable'},503):json({error:'not_found'},404)});
  assert.equal(result.passport.passport.id,passport);assert.equal(result.validation,null);
  assert.equal(result.warnings.length,1);assert.equal(result.warnings[0].section,'validation');
});
test('malformed Passport success never defaults to active', async()=>{
  await assert.rejects(loadPassportEvidence(passport,{fetchImpl:async()=>json({})}),failed('invalid_response'));
});
test('optional evidence from a different Passport is discarded with a warning', async()=>{
  const result=await loadPassportEvidence(passport,{fetchImpl:async path=>path.includes('/security/passports/')?json({passport:{id:passport,status:'active'}}):json({passport_id:'different'})});
  assert.equal(result.warnings.length,5);assert.equal(result.validation,null);
});
test('same-origin link helper excludes script/data/external URLs and credentials',()=>{
  const origin='https://accordtrace.test';
  for(const url of ['javascript:alert(1)','data:text/html,x','https://evil.test/x','//evil.test/x','https://user:pass@accordtrace.test/x']) assert.equal(safeLocalLink(url,origin),null);
  assert.equal(safeLocalLink('/agents.html?id=x',origin),'/agents.html?id=x');
});
test('request helper never fetches arbitrary external origins',async()=>{
  for(const path of ['https://evil.test/api/v1/x','//evil.test/api/v1/x','/api/v1/\\evil']) await assert.rejects(requestJson(path),failed('invalid_endpoint'));
});
test('known private credential prefixes are never placed in lookup URLs',async()=>{
  for(const value of ['sk_live_not_real','rk_test_not_real','whsec_not_real','at_test_not_real','at_live_not_real']){
    let calls=0;await assert.rejects(lookupEvidence(value,{fetchImpl:()=>{calls++;}}),failed('invalid_reference'));assert.equal(calls,0);
  }
});
test('missing links are not turned into null or undefined page URLs',()=>{
  for(const value of [null,undefined,'',' '])assert.equal(safeLocalLink(value,'https://accordtrace.test'),null);
});
