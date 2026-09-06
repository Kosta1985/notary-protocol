import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

test('complaint responses are one bounded signed response from the target Passport',()=>{
  const sql=fs.readFileSync('cloudflare/migrations/0028_community_complaint_response.sql','utf8');
  const source=fs.readFileSync('cloudflare/src/community-complaint-response.js','utf8');
  assert.match(sql,/complaint_id TEXT PRIMARY KEY/);
  assert.match(sql,/request_id TEXT NOT NULL UNIQUE/);
  assert.match(source,/responder_not_target/);
  assert.match(source,/accordtrace\.community\.complaint\.response\.v1/);
  assert.match(source,/verifyEd25519\(passport\.public_key/);
});

test('complaint evidence endpoint treats both sides as evidence, not truth or enforcement',()=>{
  const source=fs.readFileSync('cloudflare/src/community-complaint-response.js','utf8');
  assert.match(source,/Neither side is automatically treated as true/);
  assert.match(source,/automatic_trust_effect:false/);
  assert.match(source,/automatic_enforcement:false/);
  assert.doesNotMatch(source,/trust_score|blacklist|guilty/i);
});

test('runtime routes response handler before base community handler',()=>{
  const source=fs.readFileSync('cloudflare/src/worker-v2.js','utf8');
  const responseIndex=source.indexOf('handleCommunityComplaintResponse(request');
  const communityIndex=source.indexOf('handleCommunity(request');
  assert.ok(responseIndex>=0&&communityIndex>responseIndex);
  assert.match(source,/CommunityComplaintResponseError/);
});
