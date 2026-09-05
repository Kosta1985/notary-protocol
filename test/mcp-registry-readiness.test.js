import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const workflow = fs.readFileSync(new URL('../.github/workflows/publish-accord-trace-mcp.yml', import.meta.url), 'utf8');
const liveCheck = fs.readFileSync(new URL('../scripts/mcp-registry-live-check.mjs', import.meta.url), 'utf8');
const server = JSON.parse(fs.readFileSync(new URL('../server.json', import.meta.url), 'utf8'));

test('MCP registry identity and remote stay canonical', () => {
  assert.equal(server.name, 'io.github.Kosta1985/accord-trace');
  assert.equal(server.title, 'Accord Trace');
  assert.equal(server.version, '0.2.1');
  assert.deepEqual(server.remotes, [{ type: 'streamable-http', url: 'https://accordtrace.notary-labs.workers.dev/mcp' }]);
});

test('MCP publisher is pinned and integrity checked', () => {
  assert.match(workflow, /actions\/checkout@v7/);
  assert.match(workflow, /actions\/setup-node@v7/);
  assert.match(workflow, /MCP_PUBLISHER_VERSION: v1\.8\.1/);
  assert.match(workflow, /a06c9096dcb9727c13555b6be26c7effa707b01f06a4c561ba7a3635443cf2cc/);
  assert.match(workflow, /sha256sum --check --strict/);
  assert.doesNotMatch(workflow, /releases\/latest\/download/);
});

test('pull requests and pushes validate, while publishing remains manual and OIDC-scoped', () => {
  assert.match(workflow, /workflow_dispatch:/);
  assert.match(workflow, /pull_request:/);
  assert.match(workflow, /push:/);
  assert.match(workflow, /validate:\n[\s\S]*Verify server\.json against live MCP contract/);
  assert.match(workflow, /node scripts\/mcp-registry-live-check\.mjs/);
  assert.match(workflow, /publish:\n\s+if: github\.event_name == 'workflow_dispatch'/);
  assert.match(workflow, /publish:[\s\S]*permissions:\n\s+contents: read\n\s+id-token: write/);
  const globalPermissions = workflow.slice(workflow.indexOf('permissions:'), workflow.indexOf('env:'));
  assert.doesNotMatch(globalPermissions, /id-token:/, 'validation events must not receive OIDC write permission');
});

test('live MCP registry check verifies version and all public tools', () => {
  assert.match(liveCheck, /server\/discover/);
  assert.match(liveCheck, /initialize/);
  assert.match(liveCheck, /tools\/list/);
  assert.match(liveCheck, /live server version must match server\.json/);
  for (const tool of [
    'accord_trace_create_proof',
    'accord_trace_verify',
    'accord_trace_get_proof',
    'accord_trace_hash',
    'accord_trace_network_capabilities',
    'accord_trace_network_stats',
    'accord_trace_passport_product_capabilities',
    'accord_trace_resolve_referral'
  ]) assert.ok(liveCheck.includes(tool), `missing live registry assertion for ${tool}`);
  assert.match(liveCheck, /publish_performed: false/);
});
