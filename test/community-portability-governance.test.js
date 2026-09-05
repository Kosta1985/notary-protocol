import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { handleCommunity } from '../cloudflare/src/community.js';

test('community capabilities are explicit about private-status and complaint boundaries',async()=>{
  const response=await handleCommunity(new Request('https://example.test/api/v1/community/capabilities'),{},new URL('https://example.test/api/v1/community/capabilities'));
  assert.equal(response.status,200);
  const body=await response.json();
  assert.deepEqual(body.membership_tiers,['passport_holder','resident','citizen']);
  assert.match(body.membership_boundary,/private AccordTrace membership labels/i);
  assert.match(body.membership_boundary,/not nationality/i);
  assert.match(body.complaints_boundary,/allegation/i);
  assert.match(body.portability_boundary,/never private keys/i);
});

test('community schema prevents self complaints and constrains states',()=>{
  const sql=fs.readFileSync('cloudflare/migrations/0026_community_portability_governance.sql','utf8');
  assert.match(sql,/complainant_passport_id <> target_passport_id/);
  assert.match(sql,/tier IN \('passport_holder','resident','citizen'\)/);
  assert.match(sql,/state IN \('submitted','reviewing','dismissed','upheld','closed'\)/);
  assert.match(sql,/state IN \('created','completed','cancelled'\)/);
});

test('portability implementation excludes secrets and funds and requires signed agent intents',()=>{
  const source=fs.readFileSync('cloudflare/src/community.js','utf8');
  assert.match(source,/private_material_included:false/);
  assert.match(source,/funds_included:false/);
  assert.match(source,/verifyEd25519\(passport\.public_key/);
  assert.match(source,/destination_origin_https_required/);
  assert.match(source,/automatic_trust_effect:false/);
  assert.match(source,/automatic_enforcement:false/);
  assert.doesNotMatch(source,/private_key\s*:/);
  assert.doesNotMatch(source,/seed_phrase|mnemonic|wallet_secret/i);
});

test('runtime routes community separately from payment and wallet handlers',()=>{
  const source=fs.readFileSync('cloudflare/src/worker-v2.js','utf8');
  assert.match(source,/handleCommunity/);
  assert.match(source,/communityRoute/);
  assert.match(source,/communityErrorResponse/);
});
