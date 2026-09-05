import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const agenstry = fs.readFileSync(new URL('../.github/workflows/agenstry-discovery.yml', import.meta.url), 'utf8');
const liveWorkflow = fs.readFileSync(new URL('../.github/workflows/accordtrace-live-contract.yml', import.meta.url), 'utf8');
const liveContract = fs.readFileSync(new URL('../scripts/accordtrace-live-contract.mjs', import.meta.url), 'utf8');

function assertPostDeployWorkflow(source) {
  assert.match(source, /workflow_run:/);
  assert.match(source, /Deploy AccordTrace production/);
  assert.match(source, /workflow_run\.conclusion == 'success'/);
  assert.doesNotMatch(source, /\npush:\s*\n/);
}

test('Agenstry refresh cannot race production deployment', () => {
  assertPostDeployWorkflow(agenstry);
  assert.match(agenstry, /A2A-Version: 1\.0/);
  assert.match(agenstry, /Agent Affiliate Network|affiliate referral network/i);
  assert.match(agenstry, /agent passport certificate readiness/i);
  assert.match(agenstry, /did not contain the deployed Accord Trace card/);
});

test('Agenstry validator decodes the embedded A2A JSON document and requires the current 8-skill card', () => {
  assert.match(agenstry, /try fromjson catch empty/);
  assert.match(agenstry, /raw_json\?\.name\?/);
  assert.match(agenstry, /live_responds == true/);
  assert.match(agenstry, /card_format == \"current\"/);
  for (const skill of ['notarize_evidence','verify_proof','get_proof','hash_content','network_capabilities','network_stats','passport_product_capabilities','resolve_referral']) {
    assert.ok(agenstry.includes(skill), `Agenstry discovery contract missing ${skill}`);
  }
});

test('live contract runs after deployment with current action versions', () => {
  assertPostDeployWorkflow(liveWorkflow);
  assert.match(liveWorkflow, /actions\/checkout@v7/);
  assert.match(liveWorkflow, /actions\/setup-node@v7/);
  assert.match(liveWorkflow, /github\.event\.workflow_run\.head_sha/);
});

test('live contract performs canonical and compatibility read-only A2A network actions', () => {
  for (const skill of ['notarize_evidence','verify_proof','get_proof','hash_content','network_capabilities','network_stats','passport_product_capabilities','resolve_referral']) {
    assert.ok(liveContract.includes(`'${skill}'`), `live contract missing ${skill}`);
  }
  assert.match(liveContract, /A2A_METHODS = \['message\/send', 'SendMessage'\]/);
  assert.match(liveContract, /headers: \{ 'A2A-Version': '1\.0' \}/);
  assert.match(liveContract, /action: 'network_capabilities'/);
  assert.match(liveContract, /validateA2AProbe/);
  assert.match(liveContract, /canonicalMethod: 'message\/send'/);
  assert.match(liveContract, /compatibilityMethod: 'SendMessage'/);
  assert.match(liveContract, /single_level_direct_product_referral/);
  assert.match(liveContract, /amount_atomic === 200/);
  assert.match(liveContract, /amount_atomic === 100/);
  assert.match(liveContract, /cash_payouts_enabled === false/);
  assert.match(liveContract, /no_multilevel_downline_commission/);
  assert.match(liveContract, /no_self_referral/);
  assert.match(liveContract, /network capability returned JSON-RPC error/);
  assert.match(liveContract, /A2A message\/send and SendMessage returned different network policy semantics/);
});
