import fs from 'node:fs/promises';
import assert from 'node:assert/strict';
import { pathToFileURL } from 'node:url';
import { capabilityProbes, describeCapability } from '../../web/dashboard-data.js';
import { requestJson } from '../../web/public-evidence.js';

const base = 'https://accordtrace.notary-labs.workers.dev';
const headers = { 'x-notary-monitor': 'public-evidence-display-audit', 'x-accordtrace-telemetry': 'exclude' };
const report = { checked_at: new Date().toISOString(), scope: 'GET/HEAD-only public capability and evidence-page navigation at 320 and 1440 pixels. No evidence submission, Passport registration, payment, key or database mutation.', capabilities: [], pages: [], status: 'failed' };
await fs.mkdir('.audit/evidence-pages', { recursive: true });
let browser;
try {
  for (const probe of capabilityProbes) {
    const body = await requestJson(probe.path, { headers, fetchImpl: (path, init) => fetch(base + path, init) });
    const detail = describeCapability(probe, body);
    report.capabilities.push({ path: probe.path, valid: true, description: detail });
    if (probe.path.includes('passport-product')) {
      assert.equal(body.checkout_activation_enabled, false, 'Live checkout must remain held');
      assert.equal(body.commercial_ready, false); assert.equal(body.certificate_signing_enabled, true);
      report.commercial_state = { checkout_activation_enabled: body.checkout_activation_enabled, commercial_ready: body.commercial_ready, certificate_signing_enabled: body.certificate_signing_enabled };
    }
  }
  const release = await requestJson('/api/v1/launch/capabilities', { headers, fetchImpl: (path, init) => fetch(base + path, init) });
  report.release_sha = release.release_sha;
  if (process.env.EXPECTED_RELEASE_SHA) assert.equal(release.release_sha, process.env.EXPECTED_RELEASE_SHA);
  const { chromium } = await import(pathToFileURL(process.env.PLAYWRIGHT_MODULE).href);
  browser = await chromium.launch({ headless: true }); report.browser = { engine: 'chromium', version: browser.version() };
  for (const width of [320, 1440]) {
    const context = await browser.newContext({ viewport: { width, height: 900 }, extraHTTPHeaders: headers });
    const blocked = [];
    await context.route('**/*', route => {
      const req = route.request(), url = new URL(req.url());
      if (url.origin !== base || !['GET', 'HEAD'].includes(req.method())) { blocked.push({ path: url.pathname, method: req.method() }); return route.abort(); }
      return route.continue();
    });
    for (const path of ['/dashboard.html', '/verify.html', '/agents.html']) {
      const page = await context.newPage(); page.setDefaultTimeout(15000);
      const row = { path, width, errors: [], failed_responses: [], ok: false };
      page.on('pageerror', error => row.errors.push(error.message));
      page.on('response', response => { if (response.status() >= 400) row.failed_responses.push({ path: new URL(response.url()).pathname, status: response.status() }); });
      try {
        const response = await page.goto(base + path, { waitUntil: 'networkidle', timeout: 25000 }); assert.equal(response.ok(), true);
        if (path === '/dashboard.html') {
          await page.waitForFunction(() => !document.querySelector('#service-refresh').disabled);
          assert.equal(await page.locator('#service-status .card').count(), 4);
          assert.equal(await page.locator('#service-status .tag', { hasText: 'API responding' }).count(), 4);
          assert.match(await page.locator('#service-status').innerText(), /checkout remains on hold/);
          await page.locator('#service-refresh').focus(); await page.keyboard.press('Enter');
          await page.waitForFunction(() => !document.querySelector('#service-refresh').disabled);
          row.keyboard_refresh = true;
        }
        row.horizontal_overflow = await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 2);
        assert.equal(row.horizontal_overflow, false); assert.deepEqual(row.errors, []); assert.deepEqual(row.failed_responses, []);
        await page.screenshot({ path: `.audit/evidence-pages/${width}-${path.slice(1)}.png`, fullPage: true }); row.ok = true;
      } catch (error) { row.error = error.message; }
      report.pages.push(row); await page.close();
    }
    await context.close(); assert.deepEqual(blocked, []);
  }
  assert.equal(report.pages.every(row => row.ok), true); report.status = 'ok';
} catch (error) { report.error = error.message; process.exitCode = 1; }
finally { await browser?.close(); await fs.writeFile('.audit/evidence-display.json', JSON.stringify(report, null, 2)); console.log(JSON.stringify(report, null, 2)); }
