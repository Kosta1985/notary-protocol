import test from 'node:test';
import assert from 'node:assert/strict';
import { parseServiceStats, parseAffiliateStats, agentCards, formatRatio, formatCount, formatMoney, statisticsError, loadStatisticsPanels, UNKNOWN } from '../web/stats-data.js';
import { serviceStats, affiliateStats } from '../scripts/audit/statistics-fixture.mjs';
const invalid = fn => assert.throws(fn, error => error.code === 'invalid_response');
const tick = () => new Promise(resolve => setImmediate(resolve));

test('statistics: complete sparse snapshots preserve known zero values', () => {
  const empty = parseServiceStats({ windowDays: 30, totals: {}, daily: [] });
  assert.deepEqual(empty.events, []); assert.deepEqual(empty.totals, {});
  assert.equal(formatCount(0), '0'); assert.equal(formatCount(null), UNKNOWN);
});
test('statistics: incomplete HTTP-200 service snapshots are not zero activity', () => {
  for (const snapshot of [{}, { totals: {} }, { windowDays: 30, daily: [] }, { windowDays: 30, totals: {} }, { windowDays: 30, totals: [], daily: [] }]) invalid(() => parseServiceStats(snapshot));
});
test('statistics: counters must be nonnegative safe numbers, never coerced', () => {
  for (const value of [-1, '1', null, true, Infinity, NaN, Number.MAX_SAFE_INTEGER + 1, 1.2]) {
    const data = serviceStats(); data.totals.page_view = value; invalid(() => parseServiceStats(data));
  }
});
test('statistics: invalid dates, duplicate days and oversized windows are rejected', () => {
  for (const day of ['2026-02-30', 'yesterday', '2026-09-05T00:00:00Z', '<script>']) {
    const data = serviceStats(); data.daily[0].day = day; invalid(() => parseServiceStats(data));
  }
  const data = serviceStats(); data.daily.push(data.daily[0]); invalid(() => parseServiceStats(data));
  invalid(() => parseServiceStats({ ...serviceStats(), windowDays: 367 }));
});
test('statistics: total and daily aggregates must agree before they are presented', () => {
  invalid(() => parseServiceStats({ ...serviceStats(), totals: { page_view: 99 } }));
  const data = serviceStats(); data.daily = []; invalid(() => parseServiceStats(data));
});
test('statistics: bounded event names and column counts prevent arbitrary table growth', () => {
  const data = serviceStats(); data.totals['<img src=x>'] = 0; invalid(() => parseServiceStats(data));
  const totals = Object.fromEntries(Array.from({ length: 129 }, (_, i) => ['event' + i, 0]));
  invalid(() => parseServiceStats({ windowDays: 30, totals, daily: [] }));
});
test('statistics: daily sums cannot silently exceed integer precision', () => {
  invalid(() => parseServiceStats({ windowDays: 30, totals: { page_view: 1 }, daily: [{ day: '2026-09-04', page_view: Number.MAX_SAFE_INTEGER }, { day: '2026-09-05', page_view: 1 }] }));
});
test('statistics: valid daily rows are sorted without changing the source', () => {
  const data = { windowDays: 30, totals: { page_view: 3 }, daily: [{ day: '2026-09-05', page_view: 2 }, { day: '2026-09-04', page_view: 1 }] };
  assert.equal(parseServiceStats(data).daily[0].day, '2026-09-04'); assert.equal(data.daily[0].day, '2026-09-05');
});
test('statistics: missing unique-agent data stays unknown and never becomes zero agents', () => {
  assert.equal(agentCards(null), null); const cards = agentCards({ active: { active24h: 0 } });
  assert.equal(cards[0][1], '0'); assert.equal(cards[1][1], UNKNOWN); assert.equal(cards[5][1], UNKNOWN);
});
test('statistics: malformed optional agent data can be rejected independently', () => {
  const parsed = parseServiceStats({ ...serviceStats(), agents: { active: { active24h: -10 } } });
  assert.equal(parsed.totals.page_view, 4); invalid(() => agentCards(parsed.agents));
});
test('statistics: affiliate snapshot distinguishes pending, earned and paid amounts', () => {
  const data = parseAffiliateStats(affiliateStats()); assert.equal(data.commissions.pending, 1); assert.equal(data.commissions.paid, 0);
  assert.equal(data.commissions.earned_amount_atomic, 0); assert.equal(data.cashPayoutsEnabled, false);
  assert.match(formatMoney(data.price, data.currency), /2[.,]00/);
});
test('statistics: incomplete or negative affiliate data never displays manufactured zero sales', () => {
  invalid(() => parseAffiliateStats({}));
  const data = affiliateStats(); delete data.commissions.paid; invalid(() => parseAffiliateStats(data));
  const negative = affiliateStats(); negative.affiliates.active = -1; invalid(() => parseAffiliateStats(negative));
});
test('statistics: contradictory attribution and commission states are rejected', () => {
  const data = affiliateStats(); data.attributions.qualified_direct_sales = 2; invalid(() => parseAffiliateStats(data));
  const other = affiliateStats(); other.commissions.paid_amount_atomic = 100; invalid(() => parseAffiliateStats(other));
});
test('statistics: impossible currency and conversion fields cannot reach formatting', () => {
  for (const currency of [null, 'LONG', 'US$']) invalid(() => parseAffiliateStats({ ...affiliateStats(), currency }));
  for (const ratio of [null, '1', -0.1, 1.2, 0.5]) invalid(() => parseAffiliateStats({ ...affiliateStats(), conversions: { attribution_to_qualified_sale: ratio } }));
});
test('statistics: zero denominators and out-of-window ratios are not fabricated percentages', () => {
  assert.equal(formatRatio(0, 0), UNKNOWN); assert.equal(formatRatio(2, 1), UNKNOWN);
  assert.equal(formatRatio(0, 2), '0%'); assert.equal(formatRatio(1, 2, 1), '50.0%');
});
test('statistics: raw runtime messages never become user-facing errors', () => {
  assert.doesNotMatch(statisticsError(new Error('secret database details')), /secret|database/);
  assert.match(statisticsError({ code: 'invalid_response' }), /No totals have been inferred/);
});
test('statistics: affiliate network failure does not suppress the independent service result', async () => {
  const results = [], errors = [];
  await loadStatisticsPanels({ onService: x => results.push(x), onAffiliate: () => assert.fail('unexpected affiliate render'), onError: (name, error) => errors.push([name, error.code]), fetchImpl: async path => { if (path.includes('/network/')) throw Error('offline'); return Response.json(serviceStats()); } });
  assert.equal(results[0].totals.page_view, 4); assert.deepEqual(errors, [['affiliate', 'network']]);
});
test('statistics: valid affiliates survive malformed service data', async () => {
  let affiliate; const errors = [];
  await loadStatisticsPanels({ onService: () => assert.fail('unexpected service render'), onAffiliate: x => { affiliate = x; }, onError: name => errors.push(name), fetchImpl: async path => Response.json(path.includes('/network/') ? affiliateStats() : {}) });
  assert.equal(affiliate.affiliates.active, 1); assert.deepEqual(errors, ['service']);
});
test('statistics: service renders before a stalled affiliate finishes and the stall times out', async () => {
  let rendered = false; const errors = [];
  const loading = loadStatisticsPanels({ timeoutMs: 30, onService: () => { rendered = true; }, onAffiliate: () => assert.fail(), onError: (name, error) => errors.push([name, error.code]), fetchImpl: async (path, { signal }) => path.includes('/network/') ? new Promise((resolve, reject) => signal.addEventListener('abort', () => reject(Error('aborted')), { once: true })) : Response.json(serviceStats()) });
  await tick(); assert.equal(rendered, true); await loading; assert.deepEqual(errors, [['affiliate', 'timeout']]);
});
test('statistics: page cancellation suppresses late renders and error callbacks', async () => {
  const controller = new AbortController(); const events = [];
  let release; const blocker = new Promise(resolve => { release = resolve; });
  const pending = loadStatisticsPanels({ signal: controller.signal, onService: () => events.push('service'), onAffiliate: () => events.push('affiliate'), onError: () => events.push('error'), fetchImpl: async path => { await blocker; return Response.json(path.includes('/network/') ? affiliateStats() : serviceStats()); } });
  controller.abort(); release(); await pending; assert.deepEqual(events, []);
});
