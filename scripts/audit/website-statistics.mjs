import fs from 'node:fs/promises';
import assert from 'node:assert/strict';
import { pathToFileURL } from 'node:url';
import { parseServiceStats, parseAffiliateStats } from '../../web/stats-data.js';

// Bounded GET-only checks. No visits are manufactured by changing counters.
// The browser route guard rejects all writes and third-party destinations.
const base = 'https://accordtrace.notary-labs.workers.dev';
const headers = { 'x-notary-monitor': 'statistics-display-audit', 'x-accordtrace-telemetry': 'exclude' };
const report = { checked_at: new Date().toISOString(), source_sha: process.env.GITHUB_SHA || null, scope: 'Read-only production aggregate snapshots and statistics/activity navigation at 320 and 1440 pixels. No Stripe, signup, key, domain or data mutation.', snapshots: [], pages: [], status: 'failed' };
await fs.mkdir('.audit/statistics', { recursive: true });
let browser;
try {
  for (const [path, parse] of [['/v1/stats', parseServiceStats], ['/api/v1/network/stats', parseAffiliateStats]]) {
    const response = await fetch(base + path, { headers, redirect: 'error', signal: AbortSignal.timeout(15000) });
    assert.equal(response.ok, true, `Snapshot unavailable: ${path}`);
    const parsed = parse(await response.json());
    report.snapshots.push({ path, status: response.status, schema_valid: true, ...(path === '/v1/stats' ? { window_days: parsed.windowDays, event_types: parsed.events.length, daily_rows: parsed.daily.length } : { cash_payouts_enabled: parsed.cashPayoutsEnabled }) });
  }
  const { chromium } = await import(pathToFileURL(process.env.PLAYWRIGHT_MODULE).href);
  browser = await chromium.launch({ headless: true });
  report.browser = { engine: 'chromium', version: browser.version() };
  for (const width of [320, 1440]) {
    const context = await browser.newContext({ viewport: { width, height: 900 }, extraHTTPHeaders: headers });
    const blocked = [];
    await context.route('**/*', route => {
      const request = route.request();
      if (new URL(request.url()).origin !== base || !['GET', 'HEAD'].includes(request.method())) {
        blocked.push({ method: request.method(), path: new URL(request.url()).pathname });
        return route.abort('blockedbyclient');
      }
      return route.continue();
    });
    for (const path of ['/stats.html', '/activity.html']) {
      const page = await context.newPage(); page.setDefaultTimeout(15000);
      const row = { width, path, errors: [], failed_responses: [], ok: false };
      page.on('pageerror', error => row.errors.push(error.message));
      page.on('response', response => { if (response.status() >= 400) row.failed_responses.push({ path: new URL(response.url()).pathname, status: response.status() }); });
      try {
        const response = await page.goto(base + path, { waitUntil: 'networkidle', timeout: 25000 });
        assert.equal(response.ok(), true);
        const button = path === '/stats.html' ? '#stats-refresh' : '#activity-refresh';
        await page.waitForFunction(selector => !document.querySelector(selector)?.disabled, button);
        if (path === '/stats.html') {
          assert.match(await page.locator('#stats-status').innerText(), /Retrieved/);
          assert.equal(await page.locator('#affiliate-summary').isVisible(), true);
          row.hero_height = await page.locator('.hero').evaluate(el => el.getBoundingClientRect().height);
          assert.ok(row.hero_height < 600, 'Dashboard must not inherit the homepage full-screen hero');
        } else assert.match(await page.locator('#activity-updated').innerText(), /Retrieved/);
        row.overflow = await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 2);
        assert.equal(row.overflow, false);
        await page.locator(button).focus(); await page.keyboard.press('Enter');
        await page.waitForFunction(selector => !document.querySelector(selector)?.disabled, button);
        row.keyboard_refresh = true;
        await page.screenshot({ path: `.audit/statistics/${width}-${path.slice(1)}.png`, fullPage: true });
        assert.deepEqual(row.errors, []); assert.deepEqual(row.failed_responses, []);
        row.ok = true;
      } catch (error) { row.error = error.message; }
      report.pages.push(row); await page.close();
    }
    await context.close();
    assert.deepEqual(blocked, [], 'Only same-origin read-only requests are permitted');
  }
  assert.equal(report.pages.every(row => row.ok), true, 'Some statistics display checks failed');
  report.status = 'ok';
} catch (error) { report.error = error.message; process.exitCode = 1; }
finally {
  await browser?.close();
  await fs.writeFile('.audit/statistics-display.json', JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report, null, 2));
}
