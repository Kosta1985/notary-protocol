import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const workflow = fs.readFileSync(new URL('../.github/workflows/secondary-a2a-submit.yml', import.meta.url), 'utf8');

test('secondary A2A registry submission is explicit manual-only', () => {
  assert.match(workflow, /workflow_dispatch:/);
  assert.doesNotMatch(workflow, /\npush:\s*\n/);
  assert.doesNotMatch(workflow, /\nschedule:\s*\n/);
  assert.match(workflow, /cancel-in-progress: false/);
  assert.match(workflow, /Repeated unsolicited submissions are intentionally not automated/);
});

test('submission preflights the current 8-skill Accord Trace Agent Card', () => {
  assert.match(workflow, /\.well-known\/agent-card\.json/);
  assert.match(workflow, /\.name == \"Accord Trace\"/);
  assert.match(workflow, /protocolVersion == \"1\.0\"/);
  for (const skill of [
    'notarize_evidence',
    'verify_proof',
    'get_proof',
    'hash_content',
    'network_capabilities',
    'network_stats',
    'passport_product_capabilities',
    'resolve_referral'
  ]) assert.ok(workflow.includes(`index(\"${skill}\")`), `missing preflight skill ${skill}`);
});

test('post-submit verification requires exact name and canonical card URI', () => {
  assert.match(workflow, /search=Accord%20Trace/);
  assert.match(workflow, /select\(\.name\? == \"Accord Trace\"\)/);
  assert.match(workflow, /any\(\. == \$card\)/);
  assert.match(workflow, /for attempt in 1 2 3 4 5/);
  assert.match(workflow, /exact Accord Trace listing with canonical card URI was not observable/);
});
