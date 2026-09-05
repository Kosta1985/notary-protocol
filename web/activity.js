import { formatCount, formatRatio, loadServiceStats, statisticsError } from './stats-data.js';
const el = id => document.getElementById(id);
const metrics = ['metric-proofs-created', 'metric-proofs-verified', 'metric-mcp-requests', 'metric-a2a-requests', 'metric-views', 'metric-demos', 'metric-verifications', 'metric-agents', 'metric-retrievals', 'metric-pilot-views', 'metric-pilot-requests', 'rate-demo', 'rate-verify', 'rate-valid', 'rate-agents'];
let controller = null, generation = 0;
function render(stats) {
  const value = name => stats.totals[name] ?? 0;
  const views = value('page_view'), demos = value('demo_loaded'), attempts = value('verification_started'), valid = value('verification_valid'), invalid = value('verification_invalid'), agentAttempts = value('a2a_started');
  const completed = valid + invalid;
  // Independently valid counters must still have a safely representable sum.
  if (!Number.isSafeInteger(completed)) throw new Error('counter_sum_invalid');
  const values = {
    'metric-proofs-created': formatCount(value('proof_created')), 'metric-proofs-verified': formatCount(value('proof_verified')),
    'metric-mcp-requests': formatCount(value('mcp_request')), 'metric-a2a-requests': formatCount(value('a2a_request')),
    'metric-views': formatCount(views), 'metric-demos': formatCount(demos),
    'metric-verifications': formatCount(attempts), 'metric-agents': formatCount(agentAttempts),
    'metric-retrievals': formatCount(value('receipt_retrieved')),
    'metric-pilot-views': formatCount(value('pilot_page_view')), 'metric-pilot-requests': formatCount(value('pilot_apply')),
    'rate-demo': formatRatio(demos, views), 'rate-verify': formatRatio(completed, attempts),
    'rate-valid': formatRatio(valid, completed), 'rate-agents': formatRatio(agentAttempts, attempts)
  };
  for (const [id, text] of Object.entries(values)) el(id).textContent = text;
  el('activity-window').textContent = `Public telemetry \u00b7 ${stats.windowDays} days`;
  const ratios = [[demos, views], [completed, attempts], [valid, completed], [agentAttempts, attempts]];
  el('activity-ratio-note').textContent = 'These are ratios of legacy demo/receipt events, not customer conversion rates or unique-agent counts. Modern proof and protocol events are shown separately. A dash means the denominator is zero or the counts are not comparable within this window.'
    + (ratios.some(([a, b]) => a > b) ? ' Some completions or repeats may relate to events outside the returned window; those ratios are not shown.' : '');
  const maximum = Math.max(1, ...stats.daily.map(row => row.verification_started ?? 0));
  if (!stats.daily.length) el('activity-chart').textContent = 'No activity was recorded in this returned window.';
  else el('activity-chart').replaceChildren(...stats.daily.map(row => {
    const count = row.verification_started ?? 0;
    const item = document.createElement('div'), date = document.createElement('time'), track = document.createElement('span'), bar = document.createElement('i'), total = document.createElement('strong');
    date.dateTime = row.day;
    date.textContent = new Date(`${row.day}T00:00:00Z`).toLocaleDateString([], { month: 'short', day: 'numeric', timeZone: 'UTC' });
    bar.style.width = `${count / maximum * 100}%`; bar.setAttribute('aria-hidden', 'true');
    track.append(bar); total.textContent = formatCount(count); item.append(date, track, total); return item;
  }));
  el('activity-updated').textContent = `Retrieved ${new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;
}
async function refresh() {
  controller?.abort(); controller = new AbortController(); const current = ++generation;
  el('activity-refresh').disabled = true; el('activity-data').setAttribute('aria-busy', 'true');
  metrics.forEach(id => { el(id).textContent = '\u2014'; });
  el('activity-updated').textContent = 'Loading...'; el('activity-chart').textContent = 'Loading recorded events...';
  el('activity-window').textContent = 'Public telemetry'; el('activity-ratio-note').textContent = 'Event ratios will appear only after a valid statistics snapshot is returned.';
  try { const stats = await loadServiceStats({ signal: controller.signal }); if (current === generation) render(stats); }
  catch (error) {
    if (current === generation) { metrics.forEach(id => { el(id).textContent = '\u2014'; }); el('activity-chart').textContent = statisticsError(error); el('activity-updated').textContent = 'Unavailable'; }
  } finally { if (current === generation) { el('activity-refresh').disabled = false; el('activity-data').setAttribute('aria-busy', 'false'); } }
}
el('activity-refresh').addEventListener('click', refresh);
window.addEventListener('pagehide', () => { generation++; controller?.abort(); });
window.addEventListener('pageshow', event => { if (event.persisted) void refresh(); });
void refresh();
