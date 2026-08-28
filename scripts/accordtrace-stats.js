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

function normalizeAgentMetrics(stats) {
  const agents = stats?.agents ?? stats?.agentMetrics ?? null;
  if (!agents) return null;
  const active = agents.active ?? agents.identified ?? {};
  return {
    active24h: active.active24h ?? active.daily ?? null,
    active7d: active.active7d ?? active.weekly ?? null,
    active30d: active.active30d ?? active.monthly ?? null,
    new7d: active.new7d ?? null,
    returning7d: active.returning7d ?? null,
    identifiedRequests: agents.requests?.identified ?? null,
    anonymousRequests: agents.requests?.anonymous ?? null,
    protocols: agents.protocols ?? null
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
  const agentMetrics = normalizeAgentMetrics(accordTraceStats.body);

  return {
    generatedAt: new Date().toISOString(),
    attribution: {
      supported: Boolean(agentMetrics),
      method: agentMetrics ? "pseudonymous client identifier; server stores one-way hash" : null,
      note: agentMetrics
        ? "Identified agent counts exclude anonymous requests; IP addresses are not used to manufacture unique-agent counts."
        : "Current aggregate counters do not identify humans, bots, or third-party agents."
    },
    accordTrace: {
      service: accordTraceBase,
      homepageStatus: homepage.status,
      brandPresent: /Accord\s*Trace/i.test(homepageText),
      agentCardStatus: agentCard.status,
      agentName: agentCard.body?.name ?? null,
      publicStatsStatus: accordTraceStats.status,
      publicStats: accordTraceStats.body,
      agentMetrics,
      verifiedProofCount: accordTraceStats.body?.totals?.verification_valid ?? accordTraceStats.body?.totals?.proof_verified ?? null,
      note: accordTraceStats.status === 200
        ? null
        : "AccordTrace does not currently expose a public aggregate statistics endpoint."
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

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  probeAccordTrace()
    .then((result) => console.log(JSON.stringify(result, null, 2)))
    .catch((error) => {
      console.error(`AccordTrace stats probe failed: ${error.message}`);
      process.exitCode = 1;
    });
}
