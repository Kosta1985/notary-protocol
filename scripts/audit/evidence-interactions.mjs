import fs from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
import { pathToFileURL } from 'node:url';
import { capabilityProbes } from '../../web/dashboard-data.js';

// Every request is intercepted. Lifecycle fixtures dispatch synthetic pagehide /
// pageshow events; they do not claim to qualify a physical browser for bfcache.
const engines = await import(pathToFileURL(process.env.PLAYWRIGHT_MODULE).href);
const engine = process.env.BROWSER_ENGINE || 'chromium';
assert.ok(['chromium', 'firefox', 'webkit'].includes(engine));
const origin = 'https://evidence-fixture.accordtrace.test';
const assets = path.resolve('cloudflare/public');
const proof = 'atp_' + 'b'.repeat(32), agent = 'agtp_' + 'a'.repeat(64);
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
const json = (body, status = 200) => ({ status, contentType: 'application/json', body: JSON.stringify(body) });
const absent = () => json({ error: 'not_found' }, 404);
const mime = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png' };
const caps = pathname => {
  const probe = capabilityProbes.find(probe => probe.path === pathname);
  if (!probe) return null;
  return probe.feature ? { service: probe.service, version: '0.1.0', features: [probe.feature] } : {
    service: probe.service, version: '0.1.0', product: { id: 'agent_passport_certificate' }, checkout_enabled: true,
    webhook_enabled: true, certificate_signing_enabled: true, checkout_activation_enabled: false,
    referral_pricing_consistent: true, commercial_ready: false, cash_affiliate_payouts_enabled: false
  };
};
const validProof = () => ({ proof_id: proof, valid: true, integrity_mode: 'issuer_signed_hash', signature_valid: true });
const primary = () => json({ passport: { id: agent, status: 'active' } });
const browser = await engines[engine].launch({ headless: true });
const results = [];
async function scenario(name, pathname, api, run) {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const calls = [], errors = [], escaped = [];
  await context.route('**/*', async route => {
    const request = route.request(), url = new URL(request.url());
    if (url.origin !== origin) { escaped.push(url.origin); return route.abort(); }
    if (url.pathname.startsWith('/api/') || url.pathname.startsWith('/v1/')) {
      calls.push({ path: url.pathname, method: request.method() });
      const answer = await api(url.pathname, request); return route.fulfill(answer || absent()).catch(() => {});
    }
    const name = url.pathname === '/' ? 'index.html' : url.pathname.slice(1);
    const target = path.resolve(assets, name);
    if (!target.startsWith(assets + path.sep)) { escaped.push('invalid_asset'); return route.abort(); }
    try { return route.fulfill({ status: 200, body: await fs.readFile(target), contentType: mime[path.extname(target)] || 'application/octet-stream' }); }
    catch { return route.fulfill({ status: 404, body: '' }); }
  });
  const page = await context.newPage(); page.setDefaultTimeout(15000);
  page.on('pageerror', error => errors.push(error.message));
  const item = { name, ok: false, requests: calls };
  try {
    // DOM readiness does not wait for unrelated slow capability fetches.
    await page.goto(origin + pathname, { waitUntil: 'domcontentloaded' });
    await run(page, calls);
    assert.deepEqual(errors, []); assert.deepEqual(escaped, []);
    item.ok = true;
  } catch (error) { item.error = error.message; item.script_errors = errors; item.unexpected_origins = escaped; }
  finally { await context.close(); }
  results.push(item); console.log(`${item.ok ? 'PASS' : 'FAIL'} ${name}${item.error ? ' - ' + item.error : ''}`);
}
async function verify(page) {
  await page.locator('#verify-id').fill(proof); await page.locator('#verify-form button').click();
  await page.waitForFunction(() => document.querySelector('#verify-result').getAttribute('aria-busy') === 'false');
  return page.locator('#verify-result').innerText();
}
async function leaveReturn(page) {
  await page.evaluate(() => { dispatchEvent(new PageTransitionEvent('pagehide', { persisted: true })); dispatchEvent(new PageTransitionEvent('pageshow', { persisted: true })); });
}
try {
  await scenario('empty capability JSON never creates a green API status', '/dashboard.html', () => json({}), async page => {
    await page.waitForFunction(() => !document.querySelector('#service-refresh').disabled);
    assert.equal(await page.locator('#service-status .tag', { hasText: 'Not confirmed' }).count(), 4);
    assert.equal(await page.locator('#service-status .tag', { hasText: 'API responding' }).count(), 0);
  });
  await scenario('a slow capability API does not hold back the others', '/dashboard.html', async p => {
    if (p.includes('/security/')) await sleep(1500); return json(caps(p));
  }, async page => {
    await page.waitForFunction(() => document.querySelector('[data-service-path="/api/v1/validation/capabilities"] .tag').textContent === 'API responding');
    assert.equal(await page.locator('[data-service-path="/api/v1/security/capabilities"] .tag').textContent(), 'Checking');
    await page.waitForFunction(() => !document.querySelector('#service-refresh').disabled);
  });
  let recovered = false;
  await scenario('keyboard retry replaces failed capability cards without duplicating them', '/dashboard.html', p => recovered ? json(caps(p)) : json({ error: 'fixture outage' }, 503), async page => {
    await page.waitForFunction(() => !document.querySelector('#service-refresh').disabled); recovered = true;
    await page.locator('#service-refresh').focus(); await page.keyboard.press('Enter');
    await page.waitForFunction(() => document.querySelectorAll('#service-status .tag').length === 4 && [...document.querySelectorAll('#service-status .tag')].every(el => el.textContent === 'API responding'));
    assert.equal(await page.locator('#service-status .card').count(), 4);
    assert.match(await page.locator('[data-service-path="/api/v1/passport-product/capabilities"]').innerText(), /checkout remains on hold/);
  });
  await scenario('contradictory purchase readiness is not a confirmed capability', '/dashboard.html', p => json(p.includes('passport-product') ? { ...caps(p), commercial_ready: true } : caps(p)), async page => {
    await page.waitForFunction(() => !document.querySelector('#service-refresh').disabled);
    assert.equal(await page.locator('[data-service-path="/api/v1/passport-product/capabilities"] .tag').textContent(), 'Not confirmed');
    assert.equal(await page.locator('#service-status .tag', { hasText: 'API responding' }).count(), 3);
  });
  let oversized = true;
  await scenario('oversized verification response fails closed and can be retried', '/verify.html', () => json({ ...validProof(), ...(oversized ? { padding: 'x'.repeat(1_048_576) } : {}) }), async page => {
    assert.match(await verify(page), /safe display limit/);
    assert.equal(await page.locator('#verify-result').getAttribute('data-outcome'), 'invalid');
    oversized = false; assert.match(await verify(page), /Proof signature verified/);
  });
  await scenario('invalid response encoding is not silently accepted as signed evidence', '/verify.html', () => ({ status: 200, contentType: 'application/json', body: Buffer.concat([Buffer.from(JSON.stringify(validProof()).slice(0, -1) + ',"text":"'), Buffer.from([0xc3, 0x28]), Buffer.from('"}')]) }), async page => {
    assert.match(await verify(page), /incomplete or unexpected response/);
    assert.equal(await page.locator('#verify-result').getAttribute('data-outcome'), 'invalid');
  });
  await scenario('deep response structures do not reach evidence rendering', '/verify.html', () => ({ status: 200, contentType: 'application/json', body: JSON.stringify(validProof()).slice(0, -1) + ',"nested":' + '['.repeat(140) + '0' + ']'.repeat(140) + '}' }), async page => {
    assert.match(await verify(page), /supported data complexity/);
  });
  let revoked = false;
  await scenario('returning to a verified page requires a fresh check instead of displaying old proof', '/verify.html', () => json(revoked ? { ...validProof(), valid: false, signature_valid: false } : validProof()), async (page, calls) => {
    assert.match(await verify(page), /Proof signature verified/); const count = calls.length; revoked = true;
    await leaveReturn(page);
    assert.match(await page.locator('#verify-result').innerText(), /Recheck required/);
    assert.equal(await page.locator('#verify-result pre').count(), 0); assert.equal(calls.length, count);
    assert.match(await verify(page), /verification failed/);
  });
  await scenario('response delayed across navigation cannot restore a cleared verdict', '/verify.html', async () => { await sleep(350); return json(validProof()); }, async (page, calls) => {
    await page.locator('#verify-id').fill(proof); await page.locator('#verify-form button').click();
    await page.waitForTimeout(40); await leaveReturn(page); await page.waitForTimeout(450);
    assert.match(await page.locator('#verify-result').innerText(), /Recheck required/);
    assert.equal(await page.locator('#verify-result').getAttribute('aria-busy'), 'false'); assert.equal(calls.length, 1);
  });
  await scenario('Passport details and positive badges are cleared when the page is left', '/agents.html', p => p.includes('/security/') ? primary() : p.includes('/validation/') ? json({ passport_id: agent, validations: [{ outcome: 'passed', effective_status: 'passed', validation_type: 'domain_control' }] }) : absent(), async page => {
    await page.locator('#agent-id').fill(agent); await page.locator('#agent-form button').click();
    await page.waitForFunction(() => document.querySelector('#agent-state').getAttribute('aria-busy') === 'false');
    assert.equal(await page.locator('[data-copy]').count(), 1); await leaveReturn(page);
    assert.equal(await page.locator('[data-copy]').count(), 0); assert.equal(await page.locator('#raw').innerText(), '');
    assert.equal(await page.locator('#summary .card').count(), 0); assert.match(await page.locator('#agent-state').innerText(), /Recheck required/);
  });
  await scenario('dashboard drops stored Passport data and refreshes only capability checks on return', '/dashboard.html', p => caps(p) ? json(caps(p)) : p.includes('/security/passports/') ? primary() : absent(), async (page, calls) => {
    await page.waitForFunction(() => !document.querySelector('#service-refresh').disabled);
    await page.locator('#passport-id').fill(agent); await page.locator('#passport-form button').click();
    await page.waitForFunction(() => document.querySelector('#passport-result').getAttribute('aria-busy') === 'false');
    assert.equal(await page.locator('#passport-result pre').count(), 1); const count = calls.filter(c => c.path.includes('/passports/')).length;
    await leaveReturn(page); await page.waitForFunction(() => !document.querySelector('#service-refresh').disabled);
    assert.equal(await page.locator('#passport-result pre').count(), 0);
    assert.equal(calls.filter(c => c.path.includes('/passports/')).length, count);
    assert.equal(await page.locator('#service-status .card').count(), 4);
    assert.match(await page.locator('#passport-result').innerText(), /Recheck/);
  });
  await scenario('provider errors do not leak raw details into the verification page', '/verify.html', () => json({ error: 'private_fixture_detail_123' }, 503), async page => {
    const text = await verify(page); assert.match(text, /temporarily unavailable/); assert.doesNotMatch(text, /private_fixture/);
  });
} finally { await browser.close(); }
await fs.mkdir('.audit', { recursive: true });
const report = { checked_at: new Date().toISOString(), browser: engine, browser_version: browser.version(), scope: 'Isolated response-boundary, capability-status and synthetic navigation-lifecycle UI fixtures. All requests intercepted; no actual production API, Stripe, credentials or database writes.', passed: results.filter(r => r.ok).length, total: results.length, results };
await fs.writeFile('.audit/evidence-interactions.json', JSON.stringify(report, null, 2));
if (report.passed !== report.total) process.exitCode = 1;
