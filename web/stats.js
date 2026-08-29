const statusEl = document.getElementById('stats-status');
const summaryEl = document.getElementById('stats-summary');
const agentSummaryEl = document.getElementById('agent-summary');
const agentNoteEl = document.getElementById('agent-stats-note');
const headEl = document.getElementById('stats-head');
const bodyEl = document.getElementById('stats-body');

const label = (name) => String(name)
  .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
  .replaceAll('_', ' ')
  .replace(/\b\w/g, (m) => m.toUpperCase());
const number = (value) => Number(value ?? 0).toLocaleString();

function statCard(name, value) {
  const card = document.createElement('article');
  card.className = 'stat-card';
  const strong = document.createElement('strong');
  strong.textContent = number(value);
  const span = document.createElement('span');
  span.textContent = name;
  card.append(strong, span);
  return card;
}

function renderAgentMetrics(data) {
  const agents = data.agents ?? data.agentMetrics ?? null;
  if (!agents) {
    agentSummaryEl.hidden = true;
    agentNoteEl.textContent = 'Agent identity counting is not active on this deployment yet. Service usage remains available, but anonymous requests are never presented as unique agents.';
    return;
  }

  const active = agents.active ?? agents.identified ?? {};
  const requests = agents.requests ?? {};
  const protocols = agents.protocols ?? {};
  const cards = [
    ['Active agents · 24h', active.active24h ?? active.daily ?? 0],
    ['Active agents · 7d', active.active7d ?? active.weekly ?? 0],
    ['Active agents · 30d', active.active30d ?? active.monthly ?? 0],
    ['Identified requests', requests.identified ?? 0],
    ['Anonymous requests', requests.anonymous ?? 0]
  ];

  if (active.new7d != null) cards.splice(3, 0, ['New agents · 7d', active.new7d]);
  if (active.returning7d != null) cards.splice(4, 0, ['Returning agents · 7d', active.returning7d]);
  for (const [protocol, value] of Object.entries(protocols)) cards.push([`${protocol.toUpperCase()} requests`, value]);

  agentSummaryEl.hidden = false;
  agentSummaryEl.replaceChildren(...cards.map(([name, value]) => statCard(name, value)));
  agentNoteEl.textContent = agents.note ?? 'Unique-agent figures require an explicit stable client/agent identifier. Accord Trace stores only a SHA-256 hash; anonymous traffic is reported separately and is never inferred from IP addresses.';
}

function normalizeDailyRow(row) {
  if (!row || typeof row !== 'object') return null;
  const normalized = { day: row.day };
  for (const [key, value] of Object.entries(row)) {
    if (key === 'day') continue;
    normalized[key] = Number(value ?? 0);
  }
  return normalized;
}

async function readStats() {
  const endpoints = ['/api/v1/stats', '/v1/stats'];
  let lastError = null;
  for (const endpoint of endpoints) {
    try {
      const response = await fetch(endpoint, {
        headers: {
          accept: 'application/json',
          'x-notary-monitor': 'live-smoke'
        }
      });
      if (!response.ok) throw new Error(`${endpoint} returned HTTP ${response.status}`);
      return { data: await response.json(), endpoint };
    } catch (error) {
      lastError = error;
    }
  }
  throw lastError ?? new Error('No statistics endpoint is available');
}

async function loadStats() {
  try {
    const { data, endpoint } = await readStats();
    const totals = data.totals ?? {};
    const daily = (Array.isArray(data.daily) ? data.daily : []).map(normalizeDailyRow).filter(Boolean);
    const events = [...new Set([
      ...Object.keys(totals),
      ...daily.flatMap((row) => Object.keys(row).filter((key) => key !== 'day'))
    ])].sort();

    renderAgentMetrics(data);
    statusEl.textContent = `Live aggregate window: ${data.windowDays ?? 30} days · ${endpoint === '/api/v1/stats' ? 'external usage telemetry' : 'legacy aggregate telemetry'} · refreshed ${new Date().toLocaleString()}.`;
    summaryEl.hidden = false;
    summaryEl.replaceChildren(...Object.entries(totals).map(([event, value]) => statCard(label(event), value)));

    headEl.replaceChildren();
    const dateHead = document.createElement('th');
    dateHead.textContent = 'Date';
    headEl.append(dateHead);
    bodyEl.replaceChildren();

    for (const event of events) {
      const th = document.createElement('th');
      th.textContent = label(event);
      headEl.append(th);
    }

    for (const row of daily) {
      const tr = document.createElement('tr');
      const date = document.createElement('td');
      date.textContent = row.day ?? '—';
      tr.append(date);
      for (const event of events) {
        const td = document.createElement('td');
        td.textContent = number(row[event]);
        tr.append(td);
      }
      bodyEl.append(tr);
    }

    if (!Object.keys(totals).length && !events.length) {
      statusEl.textContent += ' No production events have been recorded in this window yet.';
    }
  } catch (error) {
    statusEl.textContent = `Live statistics are temporarily unavailable (${error.message}). The Accord Trace verification service operates independently of this dashboard.`;
    agentSummaryEl.hidden = true;
    agentNoteEl.textContent = 'Agent adoption statistics are temporarily unavailable with the service statistics endpoint.';
  }
}

loadStats();
