const statusEl = document.getElementById('stats-status');
const summaryEl = document.getElementById('stats-summary');
const headEl = document.getElementById('stats-head');
const bodyEl = document.getElementById('stats-body');

const label = (name) => name.replaceAll('_', ' ').replace(/\b\w/g, (m) => m.toUpperCase());
const number = (value) => Number(value ?? 0).toLocaleString();

async function loadStats() {
  try {
    const response = await fetch('/v1/stats', { headers: { accept: 'application/json' } });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const data = await response.json();
    const totals = data.totals ?? {};
    const daily = Array.isArray(data.daily) ? data.daily : [];
    const events = [...new Set([...Object.keys(totals), ...daily.flatMap((row) => Object.keys(row).filter((key) => key !== 'day'))])].sort();

    statusEl.textContent = `Live aggregate window: ${data.windowDays ?? 30} days. Last refreshed ${new Date().toLocaleString()}.`;
    summaryEl.hidden = false;
    summaryEl.replaceChildren(...events.map((event) => {
      const card = document.createElement('article');
      card.className = 'stat-card';
      const value = document.createElement('strong');
      value.textContent = number(totals[event]);
      const name = document.createElement('span');
      name.textContent = label(event);
      card.append(value, name);
      return card;
    }));

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
  }
}

loadStats();
