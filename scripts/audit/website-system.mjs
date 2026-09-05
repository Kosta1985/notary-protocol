import fs from 'node:fs/promises';
import path from 'node:path';

// Read-only, bounded production audit. Never creates proofs, orders or payments.
const base = new URL(process.argv[2] || 'https://accordtrace.notary-labs.workers.dev');
if (base.protocol !== 'https:') throw new Error('Audit target must use HTTPS');
const output = '.audit';
await fs.mkdir(output, { recursive: true });
const headers = { accept: '*/*', 'x-notary-monitor': 'website-system-audit', 'x-accordtrace-telemetry': 'exclude' };
const cache = new Map();
const checks = [];
const warnings = [];
const links = [];
const missingAnchors = [];
const limit = 160;

async function inspect(target) {
  const url = new URL(target, base);
  url.hash = '';
  if (url.origin !== base.origin) return null;
  if (cache.has(url.href)) return cache.get(url.href);
  if (cache.size >= limit) throw new Error('Audit request budget exceeded');
  const item = { path: url.pathname + url.search, ok: false };
  cache.set(url.href, item);
  const started = Date.now();
  try {
    const response = await fetch(url, { headers, signal: AbortSignal.timeout(15000) });
    item.status = response.status;
    item.content_type = response.headers.get('content-type') || '';
    item.final_path = new URL(response.url).pathname;
    item.ok = response.ok && new URL(response.url).origin === base.origin;
    if (/text|json|javascript|xml/.test(item.content_type)) item.text = await response.text();
    else await response.arrayBuffer();
    item.duration_ms = Date.now() - started;
    if (item.content_type.includes('text/html') && item.text) {
      item.title = item.text.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1] || null;
      item.ids = new Set([...item.text.matchAll(/\bid\s*=\s*["']([^"']+)["']/gi)].map(x => x[1]));
    }
  } catch (error) {
    item.error = String(error.message);
  }
  await new Promise(resolve => setTimeout(resolve, 100));
  return item;
}

const pages = (await fs.readdir('web')).filter(name => name.endsWith('.html')).sort();
for (const page of ['/', ...pages.map(name => '/' + name)]) {
  const item = await inspect(page);
  checks.push({ name: 'page', path: page, ok: Boolean(item?.ok && item.content_type.includes('text/html')), status: item?.status });
  if (!item?.text) continue;
  for (const match of item.text.matchAll(/\b(?:href|src)\s*=\s*["']([^"']+)["']/gi)) {
    try {
      const target = new URL(match[1].replaceAll('&amp;', '&'), new URL(item.final_path || page, base));
      if (target.origin === base.origin && target.protocol === 'https:') links.push({ from: page, target });
    } catch { warnings.push({ page, code: 'unparseable_link', value: match[1] }); }
  }
}
for (const { from, target } of links) {
  const item = await inspect(target);
  if (target.hash && item?.ids) {
    let id;
    try { id = decodeURIComponent(target.hash.slice(1)); } catch { id = target.hash.slice(1); }
    if (!item.ids.has(id) && id !== '') missingAnchors.push({ from, target: target.pathname + target.hash });
  }
}
const endpoints = ['/health', '/api/v1/launch/capabilities', '/api/v1/security/capabilities', '/api/v1/trust/capabilities', '/api/v1/gateway/capabilities', '/api/v1/payments/capabilities', '/api/v1/identity/capabilities', '/api/v1/validation/capabilities', '/api/v1/reputation/capabilities', '/api/v1/continuity/capabilities', '/api/v1/network/capabilities', '/api/v1/network/stats', '/api/v1/developer/capabilities', '/api/v1/passport-product/capabilities', '/.well-known/agent-card.json', '/.well-known/ai-catalog.json', '/openapi.json'];
for (const endpoint of endpoints) {
  const item = await inspect(endpoint);
  let json = null;
  try { json = JSON.parse(item?.text || ''); } catch {}
  checks.push({ name: 'json_endpoint', path: endpoint, ok: Boolean(item?.ok && json && typeof json === 'object'), status: item?.status });
  if (endpoint === '/api/v1/passport-product/capabilities' && json) {
    const gates = { checkout_enabled: json.checkout_enabled === true, webhook_enabled: json.webhook_enabled === true, certificate_signing_enabled: json.certificate_signing_enabled === true, commercial_ready: json.commercial_ready === true };
    checks.push({ name: 'passport_price', ok: json.product?.price?.amount_atomic === 200 && json.product?.price?.currency === 'usd' });
    checks.push({ name: 'passport_gates_consistent', ok: !gates.commercial_ready || (gates.checkout_enabled && gates.webhook_enabled && gates.certificate_signing_enabled && json.referral_pricing_consistent === true) });
    warnings.push({ code: gates.commercial_ready ? 'payment_end_to_end_not_tested' : 'commercial_activation_pending', gates, readiness: json.readiness || null });
  }
}
const requests = [...cache.values()].map(({ text, ids, ...item }) => item);
const failures = [...requests.filter(x => !x.ok), ...checks.filter(x => !x.ok), ...missingAnchors.map(x => ({ ...x, code: 'missing_anchor' }))];
const report = { checked_at: new Date().toISOString(), base_url: base.origin, source_sha: process.env.GITHUB_SHA || null, status: failures.length ? 'failed' : 'ok', scope: 'Read-only HTTP pages, same-origin resources, anchors and public API capability checks. Does not prove payment fulfillment or absence of all bugs.', pages_checked: pages.length + 1, requests_checked: requests.length, checks, requests, missing_anchors: missingAnchors, warnings, failures };
await fs.writeFile(path.join(output, 'website-system.json'), JSON.stringify(report, null, 2));
console.log(JSON.stringify(report, null, 2));
if (failures.length) process.exitCode = 1;
