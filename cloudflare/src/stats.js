export async function handleStats(request, env, url = new URL(request.url)) {
  if (request.method !== "GET" || url.pathname !== "/api/v1/stats") return null;

  const [analytics, proofRow] = await Promise.all([
    env.DB.prepare("SELECT day, event, count FROM analytics_daily WHERE day >= date('now', '-29 days') ORDER BY day ASC").all(),
    env.DB.prepare("SELECT COUNT(*) AS total, COALESCE(SUM(CASE WHEN receipt LIKE '%\"synthetic\":true%' THEN 1 ELSE 0 END), 0) AS synthetic FROM receipts WHERE deal_id = 'accordtrace-proof-v1'").first()
  ]);

  return json(buildStats(analytics.results ?? [], proofRow ?? {}));
}

export function buildStats(rows, proofRow = {}) {
  const totals = {};
  const days = new Map();
  for (const row of rows) {
    const count = Number(row.count) || 0;
    totals[row.event] = (totals[row.event] ?? 0) + count;
    if (!days.has(row.day)) days.set(row.day, { day: row.day });
    days.get(row.day)[row.event] = count;
  }

  const recordsTotal = Number(proofRow.total) || 0;
  const syntheticMonitorRecords = Number(proofRow.synthetic) || 0;
  const nonSyntheticRecords = Math.max(0, recordsTotal - syntheticMonitorRecords);

  return {
    service: "Accord Trace",
    windowDays: 30,
    totals,
    daily: [...days.values()],
    proofs: {
      records_total: recordsTotal,
      synthetic_monitor_records: syntheticMonitorRecords,
      non_synthetic_records: nonSyntheticRecords
    },
    protocols: {
      a2a_requests: totals.a2a_request ?? 0,
      mcp_requests: totals.mcp_request ?? 0,
      mcp_tool_calls: totals.mcp_tool_call ?? 0
    },
    privacy: "Aggregate event counts only. No IP addresses, user identifiers, or fabricated unique-agent counts are stored by this telemetry endpoint.",
    monitoring: "Requests carrying x-notary-monitor: live-smoke are excluded from aggregate event counters; synthetic proof records are reported separately."
  };
}

function json(body) {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" }
  });
}
