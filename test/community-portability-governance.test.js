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

test('community lifecycle audit is append-only and bounded to known event types',()=>{
  const sql=fs.readFileSync('cloudflare/migrations/0027_community_audit_lifecycle.sql','utf8');
  assert.match(sql,/CREATE TABLE IF NOT EXISTS community_audit_events/);
  assert.match(sql,/event_digest TEXT NOT NULL UNIQUE/);
  assert.match(sql,/migration_completed/);
  assert.match(sql,/migration_cancelled/);
  assert.doesNotMatch(sql,/UPDATE community_audit_events|DELETE FROM community_audit_events/i);
});

test('portability implementation excludes secrets and funds and requires signed agent intents',()=>{
  const source=fs.readFileSync('cloudflare/src/community.js','utf8');
  const lifecycle=fs.readFileSync('cloudflare/src/community-migration-lifecycle.js','utf8');
  assert.match(source,/private_material_included:false/);
  assert.match(source,/funds_included:false/);
  assert.match(source,/verifyEd25519\(passport\.public_key/);
  assert.match(source,/destination_origin_https_required/);
  assert.match(source,/automatic_trust_effect:false/);
  assert.match(source,/automatic_enforcement:false/);
  assert.match(lifecycle,/accordtrace\.community\.migration\.\$\{action\}\.v1/);
  assert.match(lifecycle,/state='created'/);
  assert.match(lifecycle,/community_audit_events/);
  assert.match(lifecycle,/secret_material_included:false/);
  assert.match(lifecycle,/funds_included:false/);
  assert.doesNotMatch(source,/private_key\s*:/);
  assert.doesNotMatch(lifecycle,/private_key\s*:/);
  assert.doesNotMatch(source+lifecycle,/seed_phrase|mnemonic|wallet_secret/i);
});

test('runtime routes community lifecycle separately from payment and wallet handlers',()=>{
  const source=fs.readFileSync('cloudflare/src/worker-v2.js','utf8');
  assert.match(source,/handleCommunityMigrationLifecycle/);
  assert.match(source,/handleCommunity/);
  assert.match(source,/communityRoute/);
  assert.match(source,/communityErrorResponse/);
});
