import fs from 'node:fs/promises';
import { createHash } from 'node:crypto';

// Bounded navigation / metadata / pure hash / invalid RPC checks only.
// Never creates an identity, proof, order, subscription or payment.
const base = new URL(process.argv[2] || 'https://accordtrace.notary-labs.workers.dev');
if (base.protocol !== 'https:') throw new Error('Audit target must use HTTPS');
const checks = [];
let requests = 0;
const headers = {'x-notary-monitor': 'website-entrypoints-audit', 'x-accordtrace-telemetry': 'exclude'};
async function read(path, options = {}) {
  if (++requests > 50) throw new Error('Audit request budget exceeded');
  const url = new URL(path, base);
  if (url.origin !== base.origin) throw new Error('Off-origin audit target');
  return fetch(url, { ...options, headers: { ...headers, ...options.headers }, redirect: 'manual', signal: AbortSignal.timeout(10000) });
}
function ensure(value, message) { if (!value) throw new Error(message); }
async function check(name, operation) {
  try { await operation(); checks.push({name, ok: true}); }
  catch (error) { checks.push({name, ok: false, error: error.message}); }
}
async function success(path) {
  let res = await read(path);
  if ([301, 302, 307, 308].includes(res.status)) {
    const target = new URL(res.headers.get('location'), new URL(path, base));
    ensure(target.origin === base.origin, 'Unexpected off-origin redirect');
    void res.body?.cancel().catch(() => {});
    res = await read(target.href);
  }
  ensure(res.ok, `Expected success for ${new URL(path, base).pathname}; HTTP ${res.status}`);
  return res;
}
const rpc = (method, params) => ({jsonrpc: '2.0', id: 'read-only-entrypoint-audit', method, params});
for (const path of ['/health', '/mcp', '/a2a']) {
  await check(`metadata_HEAD:${path}`, async () => {
    const get = await read(path), head = await read(path, {method: 'HEAD'});
    ensure(get.status === 200 && head.status === get.status, 'GET/HEAD status mismatch');
    ensure(head.headers.get('content-type') === get.headers.get('content-type'), 'GET/HEAD type mismatch');
    ensure(await head.text() === '', 'HEAD carried a body');
    void get.body?.cancel().catch(() => {});
  });
}
for (const path of ['/docs', '/docs.html']) {
  await check(`legacy_docs:${path}`, async () => {
    const res = await read(path);
    ensure(res.status === 308, 'Legacy documentation redirect missing');
    ensure(new URL(res.headers.get('location'), base).pathname === '/developers', 'Documentation destination mismatch');
    void res.body?.cancel().catch(() => {});
  });
}
await check('browser_404_recovery', async () => {
  const res = await read('/missing-entrypoint-audit?fixture=do-not-reflect', {headers: {accept: 'text/html'}});
  ensure(res.status === 404 && (res.headers.get('content-type') || '').includes('text/html'), 'Missing browser page must be HTML 404');
  const body = await res.text();
  ensure(body.includes('Page not found') && body.includes('/developers.html'), 'Missing recovery navigation');
  ensure(!body.includes('do-not-reflect'), 'Request parameters were reflected');
  ensure(res.headers.get('x-robots-tag') === 'noindex', '404 must not be indexed');
});
await check('api_404_remains_JSON', async () => {
  const res = await read('/api/v1/missing-entrypoint-audit', {headers: {accept: 'text/html'}});
  ensure(res.status === 404 && (res.headers.get('content-type') || '').includes('application/json'), 'API returned non-JSON 404');
  ensure((await res.json()).error === 'not_found', 'Unexpected API error');
});
await check('missing_script_is_not_HTML', async () => {
  const res = await read('/missing-entrypoint-audit.js', {headers: {accept: 'text/html'}});
  ensure(res.status === 404 && !(res.headers.get('content-type') || '').includes('text/html'), 'Missing script became HTML');
  void res.body?.cancel().catch(() => {});
});
for (const path of ['/.well-known/agent-card.json', '/.well-known/mcp.json']) {
  await check(`discovery_documentation:${path}`, async () => {
    const body = await (await read(path)).json();
    const target = new URL(body.documentationUrl || body.documentation);
    ensure(target.origin === base.origin && target.pathname === '/developers.html', 'Discovery documentation is stale');
    const docs = await success(target.href);
    ensure((docs.headers.get('content-type') || '').includes('text/html'), 'Documentation did not resolve to a page');
    void docs.body?.cancel().catch(() => {});
  });
}
await check('sitemap_targets', async () => {
  const xml = await (await success('/sitemap.xml')).text();
  const links = [...xml.matchAll(/<loc>(.*?)<\/loc>/g)].map(match => match[1]);
  ensure(links.length > 0 && links.length <= 20 && new Set(links).size === links.length, 'Sitemap links empty, duplicated or exceed audit budget');
  for (const link of links) { const res = await success(link); void res.body?.cancel().catch(() => {}); }
});
// All POSTs below are either a pure hash calculation, ping, or deliberately
// invalid protocol input. They contain no key, existing ID or write action.
for (const [name, path, body, status, errorCode] of [
  ['unknown_A2A_method', '/a2a', rpc('unsupported/entrypoint-audit', {}), 200, -32601],
  ['malformed_A2A_parts', '/a2a', rpc('SendMessage', {message: {parts: {}}}), 400, -32602],
  ['malformed_MCP_arguments', '/mcp', rpc('tools/call', {name: 'accord_trace_hash', arguments: []}), 400, -32602],
  ['MCP_ping', '/mcp', rpc('ping', {}), 200, null]
]) {
  await check(name, async () => {
    const res = await read(path, {method: 'POST', headers: {'content-type': 'application/json'}, body: JSON.stringify(body)});
    const data = await res.json();
    ensure(res.status === status && data.jsonrpc === '2.0' && data.id === body.id, 'Protocol status/envelope mismatch');
    ensure(errorCode === null ? data.result && !data.error : data.error?.code === errorCode, 'Protocol result mismatch');
  });
}
await check('stable_canonical_hash', async () => {
  const res = await read('/api/v1/hash', {method: 'POST', headers: {'content-type':'application/json'}, body:'{"data":{"b":2,"a":1}}'});
  ensure(res.status === 200, 'Hash endpoint unavailable');
  const expected = 'sha256:' + createHash('sha256').update('{"a":1,"b":2}').digest('hex');
  ensure((await res.json()).hash === expected, 'Canonical hash changed');
});
await check('hash_method_contract', async () => {
  const res = await read('/api/v1/hash');
  ensure(res.status === 405 && res.headers.get('allow') === 'POST, OPTIONS', 'Method contract missing');
  void res.body?.cancel().catch(() => {});
});
const report = {checked_at: new Date().toISOString(), base_url: base.origin, requests,
  scope: 'Bounded public navigation, metadata, pure hash and invalid-RPC checks; no business writes or payment tests.',
  status: checks.every(check => check.ok) ? 'ok' : 'failed', passed: checks.filter(check => check.ok).length, total: checks.length, checks};
await fs.mkdir('.audit', {recursive:true});
await fs.writeFile('.audit/website-entrypoints.json', JSON.stringify(report, null, 2));
console.log(JSON.stringify(report, null, 2));
if (report.status !== 'ok') process.exitCode = 1;
