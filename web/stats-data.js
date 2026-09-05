import { EvidenceError, requestJson } from './public-evidence.js';

// Read-only view models. Empty, complete snapshots may contain zero events;
// missing or malformed snapshots must never manufacture zero customers/sales.
const record = value => Boolean(value && typeof value === 'object' && !Array.isArray(value));
const own = (value, key) => Object.prototype.hasOwnProperty.call(value, key);
const fail = () => { throw new EvidenceError('invalid_response'); };
const integer = value => Number.isSafeInteger(value) && value >= 0;
const count = value => { if (!integer(value)) fail(); return value; };
const namePattern = /^[a-z][a-z0-9_]{0,63}$/;
export const UNKNOWN = '\u2014';
export function formatCount(value) { return value === null ? UNKNOWN : count(value).toLocaleString(); }
export function formatRatio(numerator, denominator, digits = 0) {
  count(numerator); count(denominator);
  if (!denominator || numerator > denominator) return UNKNOWN;
  return `${(numerator / denominator * 100).toFixed(digits)}%`;
}
function counts(value) {
  if (!record(value) || Object.keys(value).length > 128) fail();
  const pairs = Object.entries(value);
  for (const [key, value] of pairs) if (!namePattern.test(key) || key === 'day' || !integer(value)) fail();
  return Object.fromEntries(pairs);
}
function validDay(day) {
  return typeof day === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(day)
    && Number.isFinite(Date.parse(`${day}T00:00:00Z`))
    && new Date(`${day}T00:00:00Z`).toISOString().slice(0, 10) === day;
}
export function parseServiceStats(data) {
  if (!record(data) || own(data, 'error') || !Number.isSafeInteger(data.windowDays)
    || data.windowDays < 1 || data.windowDays > 366 || !Array.isArray(data.daily)
    || data.daily.length > data.windowDays) fail();
  const totals = counts(data.totals), seen = new Set(), sums = Object.create(null);
  const daily = data.daily.map(row => {
    if (!record(row) || !validDay(row.day) || seen.has(row.day)) fail();
    seen.add(row.day);
    const { day, ...values } = row;
    const parsed = counts(values);
    for (const [event, value] of Object.entries(parsed)) sums[event] = count((sums[event] || 0) + value);
    return { day, ...parsed };
  }).sort((a, b) => a.day.localeCompare(b.day));
  const events = [...new Set([...Object.keys(totals), ...Object.keys(sums)])].sort();
  if (events.length > 128) fail();
  // Both aggregates are built from the same source rows by /v1/stats.
  for (const event of events) if ((totals[event] ?? 0) !== (sums[event] ?? 0)) fail();
  return { windowDays: data.windowDays, totals, daily, events, agents: data.agents ?? data.agentMetrics ?? null };
}
function optionalCount(container, ...names) {
  if (container == null) return null;
  if (!record(container)) fail();
  for (const name of names) if (own(container, name) && container[name] != null) return count(container[name]);
  return null;
}
export function agentCards(agents) {
  if (agents == null) return null;
  if (!record(agents)) fail();
  const active = agents.active ?? agents.identified;
  const cards = [
    ['Active agents \u00b7 24h', optionalCount(active, 'active24h', 'daily')],
    ['Active agents \u00b7 7d', optionalCount(active, 'active7d', 'weekly')],
    ['Active agents \u00b7 30d', optionalCount(active, 'active30d', 'monthly')],
    ['New agents \u00b7 7d', optionalCount(active, 'new7d')],
    ['Returning agents \u00b7 7d', optionalCount(active, 'returning7d')],
    ['Identified requests', optionalCount(agents.requests, 'identified')],
    ['Anonymous requests', optionalCount(agents.requests, 'anonymous')]
  ];
  const protocols = agents.protocols == null ? {} : counts(agents.protocols);
  for (const [protocol, value] of Object.entries(protocols)) cards.push([`${protocol.toUpperCase()} requests`, value]);
  return cards.map(([name, value]) => [name, formatCount(value)]);
}
function requiredCounts(value, names) {
  if (!record(value)) fail();
  return Object.fromEntries(names.map(name => [name, count(value[name])]));
}
function sum(values) { return values.reduce((total, value) => count(total + value), 0); }
export function parseAffiliateStats(data) {
  if (!record(data) || own(data, 'error') || data.model !== 'single_level_direct_product_referral'
    || typeof data.currency !== 'string' || !/^[a-z]{3}$/i.test(data.currency)
    || typeof data.cash_payouts_enabled !== 'boolean') fail();
  const affiliates = requiredCounts(data.affiliates, ['total', 'active']);
  const invitations = requiredCounts(data.invitation_payloads, ['total', 'last_30d']);
  const attributions = requiredCounts(data.attributions, ['total', 'reserved', 'held', 'qualified_direct_sales', 'rejected', 'reversed']);
  const commissions = requiredCounts(data.commissions, ['total', 'pending', 'earned', 'held', 'reversed', 'paid', 'pending_amount_atomic', 'earned_amount_atomic', 'paid_amount_atomic']);
  if (affiliates.active > affiliates.total || invitations.last_30d > invitations.total) fail();
  if (sum(['reserved', 'held', 'qualified_direct_sales', 'rejected', 'reversed'].map(k => attributions[k])) !== attributions.total) fail();
  if (sum(['pending', 'earned', 'held', 'reversed', 'paid'].map(k => commissions[k])) !== commissions.total) fail();
  for (const state of ['pending', 'earned', 'paid']) if (commissions[state] === 0 && commissions[`${state}_amount_atomic`] !== 0) fail();
  const ratio = data.conversions?.attribution_to_qualified_sale;
  const expected = attributions.total ? attributions.qualified_direct_sales / attributions.total : 0;
  if (typeof ratio !== 'number' || !Number.isFinite(ratio) || ratio < 0 || ratio > 1 || Math.abs(ratio - expected) > 0.000051) fail();
  const price = count(data.passport_price_atomic), commission = count(data.direct_commission_atomic);
  return { affiliates, invitations, attributions, commissions, currency: data.currency.toUpperCase(), price, commission, cashPayoutsEnabled: data.cash_payouts_enabled };
}
export function formatMoney(amount, currency) {
  count(amount);
  // These endpoints report hundredths of the configured currency, not arbitrary
  // Stripe minor units. Keep that existing display contract; do not alter prices.
  try { return new Intl.NumberFormat(undefined, { style: 'currency', currency }).format(amount / 100); }
  catch { fail(); }
}
export function statisticsError(error) {
  const messages = {
    invalid_response: 'The statistics response was incomplete or inconsistent. No totals have been inferred.',
    timeout: 'The statistics request timed out. Please retry.',
    rate_limited: 'Too many requests. Please wait before retrying.',
    network: 'The statistics service could not be reached. Check your connection and retry.',
    cancelled: 'The statistics request was cancelled.'
  };
  return messages[error?.code] || 'Statistics are temporarily unavailable. Please retry.';
}
export async function loadServiceStats(options = {}) {
  return parseServiceStats(await requestJson('/v1/stats', options));
}
export async function loadStatisticsPanels({ signal, onService, onAffiliate, onError, ...options }) {
  // Render each result as soon as it is available. One failed or slow panel must
  // not discard the independent result of another endpoint.
  async function panel(name, path, parse, render) {
    try {
      const data = parse(await requestJson(path, { ...options, signal }));
      if (!signal?.aborted) render(data);
    } catch (error) {
      if (!signal?.aborted) onError(name, error);
    }
  }
  await Promise.all([
    panel('service', '/v1/stats', parseServiceStats, onService),
    panel('affiliate', '/api/v1/network/stats', parseAffiliateStats, onAffiliate)
  ]);
}
