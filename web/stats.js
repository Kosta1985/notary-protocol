const statusEl = document.getElementById('stats-status');
const summaryEl = document.getElementById('stats-summary');
const agentSummaryEl = document.getElementById('agent-summary');
const agentNoteEl = document.getElementById('agent-stats-note');
const headEl = document.getElementById('stats-head');
const bodyEl = document.getElementById('stats-body');

const label = (name) => name.replaceAll('_', ' ').replace(/\b\w/g, (m) => m.toUpperCase());
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
    agentNoteEl.textContent = 'Agent identity counting is not active on this deployment yet. Service usage below remains accurate, but it must not be presented as a unique-agent count.';
    return;
  }

  const active = agents.active ?? agents.identified ?? {};
  const requests = agents.requests ?? {};
  const protocols = agents.protocols ?? {};
  const cards = [
    ['Active agents · 24h', active.active24h ?? active.daily ?? 0],
    ['Active agents · 7d', active.active7d ?? active.weekly ?? 0],
    ['Active agents · 30d', active.active30d ?? active.monthly ?? 0],
    ['New agents · 7d', active.new7d ?? 0],
    ['Returning agents · 7d', active.returning7d ?? 0],
    ['Identified requests', requests.identified ?? 0],
    ['Anonymous requests', requests.anonymous ?? 0]
  ];
  for (const [protocol, value] of Object.entries(protocols)) cards.push([`${protocol.toUpperCase()} requests`, value]);

  agentSummaryEl.hidden = false;
  agentSummaryEl.replaceChildren(...cards.map(([name, value]) => statCard(name, value)));
  agentNoteEl.textContent = agents.note ?? 'Unique-agent figures count pseudonymous client identifiers only. Anonymous requests are reported separately.';
}

async function loadStats() {
  try {
    const response = await fetch('/v1/stats', { headers: { accept: 'application/json' } });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const data = await response.json();
    const totals = data.totals ?? {};
    const daily = Array.isArray(data.daily) ? data.daily : [];
    const events = [...new Set([...Object.keys(totals), ...daily.flatMap((row) => Object.keys(row).filter((key) => key !== 'day'))])].sort();

    renderAgentMetrics(data);
    statusEl.textContent = `Live aggregate window: ${data.windowDays ?? 30} days. Last refreshed ${new Date().toLocaleString()}.`;
    summaryEl.hidden = false;
    summaryEl.replaceChildren(...events.map((event) => statCard(label(event), totals[event])));

    for (const event of events) {
      const th = document.createElement('th');
      th.textContent = label(event);
      headEl.append(th);
    }

    for (const row of daily) {
      const tr = document.createElement('tr');
      const date = document.createElement('td');
      date.textContent = row.day;
      tr.append(date);
      for (const event of events) {
        const td = document.createElement('td');
        td.textContent = number(row[event]);
        tr.append(td);
      }
      bodyEl.append(tr);
    }

    if (!events.length) statusEl.textContent += ' No production events have been recorded in this window yet.';
  } catch (error) {
    statusEl.textContent = `Live statistics are temporarily unavailable (${error.message}). The Accord Trace service can continue operating independently of this dashboard.`;
    agentNoteEl.textContent = 'Agent adoption statistics are temporarily unavailable with the service statistics endpoint.';
  }
}

loadStats();
