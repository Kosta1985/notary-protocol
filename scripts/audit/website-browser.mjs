import fs from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

// Browser smoke is navigation-only. Block all writes, including accidental form requests.
const { chromium } = await import(pathToFileURL(process.env.PLAYWRIGHT_MODULE).href);
const base = new URL(process.argv[2] || 'https://accordtrace.notary-labs.workers.dev');
if (base.protocol !== 'https:') throw new Error('Audit target must use HTTPS');
await fs.mkdir('.audit/screenshots', { recursive: true });
const browser = await chromium.launch({ headless: true });
const results = [];
try {
  for (const [device, viewport] of [['desktop', { width: 1440, height: 1000 }], ['mobile', { width: 390, height: 844 }]]) {
    const context = await browser.newContext({ viewport, extraHTTPHeaders: { 'x-notary-monitor': 'website-browser-audit', 'x-accordtrace-telemetry': 'exclude' } });
    await context.route('**/*', route => ['GET', 'HEAD', 'OPTIONS'].includes(route.request().method()) ? route.continue() : route.abort('blockedbyclient'));
    for (const route of ['/', '/start.html', '/passport.html', '/network.html', '/developers.html', '/verify.html', '/stats.html', '/agents.html']) {
      const page = await context.newPage();
      const errors = [];
      const badResponses = [];
      page.on('pageerror', error => errors.push(error.message));
      page.on('response', response => {
        if (response.status() >= 400 && new URL(response.url()).origin === base.origin) badResponses.push({ path: new URL(response.url()).pathname, status: response.status() });
      });
      const item = { device, path: route, errors, bad_responses: badResponses, ok: false };
      try {
        const response = await page.goto(new URL(route, base).href, { waitUntil: 'networkidle', timeout: 25000 });
        await page.waitForTimeout(700);
        item.status = response.status();
        item.title = await page.title();
        item.layout = await page.evaluate(() => ({ viewport: innerWidth, document: document.documentElement.scrollWidth, body: document.body.scrollWidth }));
        item.horizontal_overflow = Math.max(item.layout.document, item.layout.body) > item.layout.viewport + 2;
        if (route === '/passport.html') item.checkout = await page.locator('#buy-button').evaluate(el => ({ label: el.textContent, href: el.getAttribute('href'), disabled: el.getAttribute('aria-disabled') }));
        item.ok = response.ok() && errors.length === 0 && badResponses.length === 0 && !item.horizontal_overflow;
        const filename = `${device}-${route === '/' ? 'home' : route.slice(1).replaceAll('/', '-')}.png`;
        await page.screenshot({ path: path.join('.audit/screenshots', filename), fullPage: true });
        item.screenshot = filename;
      } catch (error) { item.error = error.message; }
      results.push(item);
      await page.close();
    }
    await context.close();
  }
} finally { await browser.close(); }
const report = { checked_at: new Date().toISOString(), base_url: base.origin, status: results.every(x => x.ok) ? 'ok' : 'failed', scope: 'Chromium desktop/mobile navigation, script errors, failed same-origin responses and horizontal overflow. No payment or signed operation was submitted.', results };
await fs.writeFile('.audit/website-browser.json', JSON.stringify(report, null, 2));
console.log(JSON.stringify(report, null, 2));
if (report.status !== 'ok') process.exitCode = 1;
