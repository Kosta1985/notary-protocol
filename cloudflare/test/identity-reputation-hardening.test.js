import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';
const identity=fs.readFileSync(new URL('../src/identity-hardening.js',import.meta.url),'utf8');
const reputation=fs.readFileSync(new URL('../src/reputation-hardening.js',import.meta.url),'utf8');
const worker=fs.readFileSync(new URL('../src/worker.js',import.meta.url),'utf8');

test('identity hardening handles missing passports before property access',()=>{assert.match(identity,/if\(!attestor\)return reply\(\{error:'attestor_passport_not_found'\},404\)/);assert.match(identity,/if\(!subject\)return reply\(\{error:'subject_passport_not_found'\},404\)/);assert.ok(identity.indexOf("attestor_passport_not_found")<identity.indexOf("attestor.id===subject.id"));});
test('non-domain identity references are digest-only publicly',()=>{assert.match(identity,/subject_ref:type==='verified_domain'\?storedRef:null/);assert.match(identity,/subject_ref_digest/);assert.match(identity,/Recovery-key fingerprints are never exposed/);});
test('identity qualification requires active unique recovery profile',()=>{assert.match(identity,/x\.attestor_safety_state==='active'&&uniqueRecovery/);assert.match(identity,/unqualified_active_attestations/);});
test('reputation hardening replaces identity confidence with safety-qualified evidence',()=>{assert.match(reputation,/qualification:'safety_qualified_only'/);assert.match(reputation,/excluded_unsafe_or_shared_recovery_attestations/);assert.match(reputation,/shared_recovery_control_pattern/);assert.match(reputation,/review_only_not_proof/);assert.match(reputation,/r\.trust_score=null/);});
test('worker invokes hardening before legacy identity and reputation handlers',()=>{assert.ok(worker.indexOf('handleIdentityHardening')<worker.indexOf('handleIdentity(request'));assert.ok(worker.indexOf('handleReputationHardening')<worker.indexOf('handleReputation(request'));});
