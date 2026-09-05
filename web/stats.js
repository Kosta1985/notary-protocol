import { agentCards, formatCount, formatMoney, formatRatio, loadStatisticsPanels, statisticsError } from './stats-data.js';

const el = id => document.getElementById(id);
const button = el('stats-refresh');
let controller = null, generation = 0;
function statCard(name, value) {
  const card = document.createElement('article'); card.className = 'stat-card';
  const strong = document.createElement('strong'); strong.textContent = value;
  const label = document.createElement('span'); label.textContent = name;
  card.append(strong, label); return card;
}
function showCards(id, cards) { el(id).replaceChildren(...cards.map(([name, value]) => statCard(name, value))); el(id).hidden = false; }
function renderService(data) {
  const label = name => name.replaceAll('_', ' ').replace(/\b\w/g, m => m.toUpperCase());
  showCards('stats-summary', data.events.map(event => [label(event), formatCount(data.totals[event] ?? 0)]));
  const th = text => { const cell = document.createElement('th'); cell.textContent = text; cell.scope = 'col'; return cell; };
  el('stats-head').replaceChildren(th('Date'), ...data.events.map(event => th(label(event))));
  el('stats-body').replaceChildren(...data.daily.map(row => {
    const tr = document.createElement('tr'), date = document.createElement('th'); date.scope = 'row'; date.textContent = row.day; tr.append(date);
    for (const event of data.events) { const cell = document.createElement('td'); cell.textContent = formatCount(row[event] ?? 0); tr.append(cell); }
    return tr;
  }));
  el('stats-table').hidden = data.daily.length === 0;
  el('daily-status').textContent = data.daily.length ? 'Recorded event counts by UTC date. Use the scrollable table to inspect every event.' : 'No daily events were recorded in this returned window.';
  el('stats-status').textContent = `Reported aggregate window: ${data.windowDays} days. Retrieved ${new Date().toLocaleString()}.` + (data.events.length ? '' : ' No events were recorded in this returned window.');
  try {
    const cards = agentCards(data.agents);
    if (cards) { showCards('agent-summary', cards); el('agent-stats-note').textContent = 'Only returned identifier-based metrics are shown. A dash means not reported, not zero. Requests are not unique agents.'; }
    else el('agent-stats-note').textContent = 'Unique-agent metrics were not returned by this deployment. Service requests must not be presented as a unique-agent count.';
  } catch { el('agent-stats-note').textContent = 'Agent metrics could not be confirmed. Valid aggregate service activity is shown separately.'; }
  for (const id of ['service-panel', 'agent-panel', 'daily-panel']) el(id).setAttribute('aria-busy', 'false');
}
function renderAffiliate(data) {
  const a = data.attributions, c = data.commissions;
  showCards('affiliate-summary', [
    ['Active affiliates', formatCount(data.affiliates.active)],
    ['Generated invites \u00b7 30d', formatCount(data.invitations.last_30d)],
    ['Direct attributions', formatCount(a.total)], ['Qualified direct sales', formatCount(a.qualified_direct_sales)],
    ['Held for review', formatCount(a.held)], ['Earned commissions', formatCount(c.earned)],
    ['Actually paid commissions', formatCount(c.paid)], ['Earned amount', formatMoney(c.earned_amount_atomic, data.currency)],
    ['Actually paid amount', formatMoney(c.paid_amount_atomic, data.currency)],
    ['Attribution \u2192 sale', formatRatio(a.qualified_direct_sales, a.total, 1)]
  ]);
  el('affiliate-stats-note').textContent = `Reported economics: ${formatMoney(data.price, data.currency)} Passport / ${formatMoney(data.commission, data.currency)} direct qualifying commission. `
    + 'An invitation is not a customer or sale; earned and paid commissions are distinct. '
    + (a.total ? '' : 'Conversion is not defined without any attributions. ')
    + (data.cashPayoutsEnabled ? 'Payout availability does not prove that any payment occurred.' : 'Cash payouts remain disabled.')
    + ` Retrieved ${new Date().toLocaleString()}.`;
  el('affiliate-panel').setAttribute('aria-busy', 'false');
}
function renderError(name, error) {
  if (name === 'affiliate') {
    el('affiliate-summary').replaceChildren(); el('affiliate-summary').hidden = true;
    el('affiliate-stats-note').textContent = statisticsError(error) + ' No sales or commissions are inferred from unavailable data.';
    el('affiliate-panel').setAttribute('aria-busy', 'false');
  } else {
    el('stats-status').textContent = statisticsError(error);
    el('agent-stats-note').textContent = 'Agent metrics are unavailable with the service snapshot. No unique-agent count is inferred.';
    el('daily-status').textContent = 'Daily statistics could not be confirmed.';
    for (const id of ['stats-summary', 'agent-summary']) { el(id).hidden = true; el(id).replaceChildren(); }
    el('stats-body').replaceChildren(); el('stats-table').hidden = true;
    for (const id of ['service-panel', 'agent-panel', 'daily-panel']) el(id).setAttribute('aria-busy', 'false');
  }
}
async function refresh() {
  controller?.abort(); controller = new AbortController(); const current = ++generation;
  button.disabled = true;
  for (const id of ['stats-summary', 'agent-summary', 'affiliate-summary']) { el(id).hidden = true; el(id).replaceChildren(); }
  el('stats-body').replaceChildren(); el('stats-table').hidden = true;
  for (const id of ['stats-status', 'agent-stats-note', 'affiliate-stats-note', 'daily-status']) el(id).textContent = 'Loading current statistics...';
  for (const id of ['service-panel', 'agent-panel', 'affiliate-panel', 'daily-panel']) el(id).setAttribute('aria-busy', 'true');
  await loadStatisticsPanels({ signal: controller.signal,
    onService: data => { if (current === generation) renderService(data); },
    onAffiliate: data => { if (current === generation) renderAffiliate(data); },
    onError: (name, error) => { if (current === generation) renderError(name, error); }
  });
  if (current === generation) button.disabled = false;
}
button.addEventListener('click', refresh);
window.addEventListener('pagehide', () => { generation++; controller?.abort(); });
window.addEventListener('pageshow', event => { if (event.persisted) void refresh(); });
void refresh();
