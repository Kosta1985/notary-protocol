import { fileURLToPath } from "node:url";

const accordTraceBase = String(process.argv[2] || "https://accordtrace.notary-labs.workers.dev").replace(/\/$/, "");
const legacyBase = String(process.argv[3] || "https://notary-protocol.notary-labs.workers.dev").replace(/\/$/, "");
const monitorHeaders = { "x-notary-monitor": "live-smoke" };

async function readJson(url, fetcher) {
  const response = await fetcher(url, { headers: monitorHeaders });
  return {
    status: response.status,
    body: response.ok ? await response.json().catch(() => null) : null
  };
}

export async function probeAccordTrace(fetcher = fetch) {
  const [homepage, agentCard, accordTraceStats, legacyStats] = await Promise.all([
    fetcher(`${accordTraceBase}/`, { headers: monitorHeaders }),
    readJson(`${accordTraceBase}/.well-known/agent-card.json`, fetcher),
    readJson(`${accordTraceBase}/api/v1/stats`, fetcher),
    readJson(`${legacyBase}/v1/stats`, fetcher)
  ]);
  const homepageText = homepage.ok ? await homepage.text() : "";
  const stats = accordTraceStats.body;

  return {
    generatedAt: new Date().toISOString(),
    attribution: {
      supported: false,
      method: null,
      note: "Accord Trace reports aggregate event counts only and does not manufacture unique-agent counts from IP addresses or anonymous requests."
    },
    accordTrace: {
      service: accordTraceBase,
      homepageStatus: homepage.status,
      brandPresent: /Accord\s*Trace/i.test(homepageText),
      agentCardStatus: agentCard.status,
      agentName: agentCard.body?.name ?? null,
      publicStatsStatus: accordTraceStats.status,
      publicStats: stats,
      proofRecordsTotal: stats?.proofs?.records_total ?? null,
      syntheticMonitorProofs: stats?.proofs?.synthetic_monitor_records ?? null,
      nonSyntheticProofs: stats?.proofs?.non_synthetic_records ?? null,
      a2aRequests30d: stats?.protocols?.a2a_requests ?? null,
      mcpRequests30d: stats?.protocols?.mcp_requests ?? null,
      verifiedProofCount30d: stats?.totals?.proof_verify_valid ?? null,
      note: accordTraceStats.status === 200 ? null : "Accord Trace modern aggregate statistics are unavailable."
    },
    legacyNotaryProtocol: {
      service: legacyBase,
      publicStatsStatus: legacyStats.status,
      publicStats: legacyStats.body,
      pageViews: legacyStats.body?.totals?.page_view ?? null,
      validVerifications: legacyStats.body?.totals?.verification_valid ?? null
    }
  };
}

function assertModernStats(result) {
  if (result.accordTrace.homepageStatus !== 200) throw new Error(`Accord Trace homepage HTTP ${result.accordTrace.homepageStatus}`);
  if (result.accordTrace.agentCardStatus !== 200 || result.accordTrace.agentName !== "Accord Trace") throw new Error("Current Accord Trace Agent Card is unavailable or stale");
  if (result.accordTrace.publicStatsStatus !== 200) throw new Error(`Accord Trace /api/v1/stats HTTP ${result.accordTrace.publicStatsStatus}`);
  const stats = result.accordTrace.publicStats;
  if (stats?.service !== "Accord Trace" || stats?.windowDays !== 30) throw new Error("Accord Trace stats contract is invalid");
  if (!stats?.proofs || !stats?.protocols || typeof stats?.privacy !== "string") throw new Error("Accord Trace stats contract is incomplete");
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  probeAccordTrace()
    .then((result) => {
      console.log(JSON.stringify(result, null, 2));
      assertModernStats(result);
    })
    .catch((error) => {
      console.error(`Accord Trace stats probe failed: ${error.message}`);
      process.exitCode = 1;
    });
}
