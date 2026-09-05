import assert from 'node:assert/strict';
import fs from 'node:fs';

const metadata = JSON.parse(fs.readFileSync(new URL('../server.json', import.meta.url), 'utf8'));
const remote = metadata.remotes?.find((entry) => entry?.type === 'streamable-http');

assert.equal(metadata.name, 'io.github.Kosta1985/accord-trace');
assert.equal(metadata.title, 'Accord Trace');
assert.equal(metadata.version, '0.2.1');
assert.ok(/^https:\/\//.test(metadata.websiteUrl), 'websiteUrl must use HTTPS');
assert.ok(remote, 'server.json must expose a streamable-http remote');
assert.ok(/^https:\/\//.test(remote.url), 'MCP remote must use HTTPS');
assert.equal(new URL(remote.url).origin, new URL(metadata.websiteUrl).origin, 'registry website and MCP remote must share the production origin');
assert.equal(new URL(remote.url).pathname, '/mcp');

const getStatus = await fetch(remote.url, {
  headers: { accept: 'application/json' },
  signal: AbortSignal.timeout(10_000)
});
assert.equal(getStatus.status, 200, `GET ${remote.url} must return 200`);
const status = await getStatus.json();
assert.equal(status.service, 'Accord Trace');
assert.equal(status.protocol, 'MCP');
assert.equal(status.transport, 'streamable-http');
assert.equal(status.status, 'ready');
assert.ok(typeof status.protocol_version === 'string' && status.protocol_version.length > 0, 'live MCP must advertise a protocol version');

async function rpc(method, params = undefined, id = method) {
  const body = { jsonrpc: '2.0', id, method };
  if (params !== undefined) body.params = params;
  const response = await fetch(remote.url, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      accept: 'application/json'
    },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(10_000)
  });
  assert.equal(response.status, 200, `${method} must return HTTP 200`);
  const payload = await response.json();
  assert.equal(payload.jsonrpc, '2.0');
  assert.equal(payload.id, id);
  assert.equal(payload.error, undefined, `${method} returned JSON-RPC error: ${JSON.stringify(payload.error)}`);
  return payload.result;
}

const discover = await rpc('server/discover');
assert.equal(discover.name, 'accord-trace');
assert.equal(discover.version, metadata.version, 'live server version must match server.json');
assert.equal(discover.transport, 'streamable-http');
assert.ok(Array.isArray(discover.supportedVersions) && discover.supportedVersions.includes(status.protocol_version), 'GET protocol version must be supported by server/discover');

const initialized = await rpc('initialize', { protocolVersion: status.protocol_version, capabilities: {}, clientInfo: { name: 'accordtrace-registry-check', version: '1' } });
assert.equal(initialized.protocolVersion, status.protocol_version);
assert.equal(initialized.serverInfo?.name, 'accord-trace');
assert.equal(initialized.serverInfo?.version, metadata.version, 'initialize version must match server.json');

const listed = await rpc('tools/list');
const toolNames = new Set((listed.tools ?? []).map((tool) => tool.name));
const requiredTools = [
  'accord_trace_create_proof',
  'accord_trace_verify',
  'accord_trace_get_proof',
  'accord_trace_hash',
  'accord_trace_network_capabilities',
  'accord_trace_network_stats',
  'accord_trace_passport_product_capabilities',
  'accord_trace_resolve_referral'
];
for (const tool of requiredTools) assert.ok(toolNames.has(tool), `live MCP missing required tool: ${tool}`);

console.log(JSON.stringify({
  status: 'passed',
  registry_name: metadata.name,
  registry_version: metadata.version,
  remote: remote.url,
  protocol_version: status.protocol_version,
  required_tools: requiredTools.length,
  publish_performed: false
}, null, 2));
