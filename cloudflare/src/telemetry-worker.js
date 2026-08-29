import coreWorker from "./index.js";

const encoder = new TextEncoder();
const INTERNAL_MONITOR_VALUES = new Set(["live-smoke", "github-actions", "internal-test"]);

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);

    if (request.method === "GET" && url.pathname === "/api/v1/stats") {
      return publicStats(env);
    }

    const startedAt = Date.now();
    let response;
    try {
      response = await coreWorker.fetch(request, env, ctx);
    } catch (error) {
      const classification = classifyRequest(request);
      if (classification.track) {
        ctx?.waitUntil?.(recordUsage(env, request, classification, 500, Date.now() - startedAt));
      }
      throw error;
    }

    const classification = classifyRequest(request);
    if (classification.track) {
      const write = recordUsage(env, request, classification, response.status, Date.now() - startedAt);
      if (ctx?.waitUntil) ctx.waitUntil(write);
      else await write;
    }

    return response;
  }
};

export function classifyRequest(request) {
  const url = new URL(request.url);
  const path = url.pathname;
  const monitor = request.headers.get("x-notary-monitor")?.toLowerCase() ?? "";
  const explicitInternal = request.headers.get("x-accordtrace-internal") === "1";
  const internal = explicitInternal || INTERNAL_MONITOR_VALUES.has(monitor);

  if (
    request.method === "OPTIONS" ||
    path === "/health" ||
    path === "/api/v1/stats" ||
    path === "/v1/stats" ||
    path.startsWith("/.well-known/") ||
    path === "/openapi.json"
  ) {
    return { track: false, internal, protocol: "system", action: "ignored" };
  }

  let protocol = "rest";
  if (path === "/a2a" || path.startsWith("/a2a/")) protocol = "a2a";
  else if (path === "/mcp" || path.startsWith("/mcp/")) protocol = "mcp";

  let action = "api_call";
  if (
    request.method === "POST" &&
    (path === "/api/v1/proofs" || path === "/v1/proofs" || path === "/proofs")
  ) action = "proof_created";
  else if (
    request.method === "POST" &&
    (path === "/api/v1/verify" || path === "/v1/verify" || path === "/v1/receipts/verify" || path === "/verify")
  ) action = "verification";
  else if (protocol === "mcp") action = "mcp_call";
  else if (protocol === "a2a") action = "a2a_call";

  const apiLike = protocol !== "rest" || request.method !== "GET" || path.startsWith("/api/") || path.startsWith("/v1/");
  return { track: apiLike, internal, protocol, action };
}

async function recordUsage(env, request, classification, status, durationMs) {
  const success = status >= 200 && status < 400;
  const external = classification.internal ? 0 : 1;
  const agentId = explicitAgentId(request);
  const agentHash = agentId ? await sha256(agentId) : null;

  try {
    env.USAGE_ANALYTICS?.writeDataPoint({
      blobs: [
        classification.action,
        classification.protocol,
        external ? "external" : "internal",
        success ? "success" : "failure",
        request.method,
        new URL(request.url).pathname,
        agentHash ?? "anonymous"
      ],
      doubles: [1, status, durationMs],
      indexes: [agentHash ?? classification.protocol]
    });
  } catch {
    // Analytics Engine telemetry must never affect the user request.
  }

  if (!env.DB) return;

  const metrics = ["api_calls_total", success ? "successful_calls" : "failed_calls"];
  if (success && classification.action === "proof_created") metrics.push("proofs_created_total");
  if (success && classification.action === "verification") metrics.push("verifications_total");
  if (classification.protocol === "mcp") metrics.push("mcp_calls_total");
  if (classification.protocol === "a2a") metrics.push("a2a_calls_total");
  metrics.push(external ? "external_calls" : "internal_test_calls");

  try {
    for (const metric of metrics) {
      await env.DB.prepare(
        "INSERT INTO usage_daily (day, metric, protocol, external, count) VALUES (date('now'), ?1, ?2, ?3, 1) ON CONFLICT(day, metric, protocol, external) DO UPDATE SET count = count + 1"
      ).bind(metric, classification.protocol, external).run();
    }

    await env.DB.prepare(
      "INSERT INTO agent_requests_daily (day, protocol, identified, anonymous) VALUES (date('now'), ?1, ?2, ?3) ON CONFLICT(day, protocol) DO UPDATE SET identified = identified + excluded.identified, anonymous = anonymous + excluded.anonymous"
    ).bind(classification.protocol, agentHash ? 1 : 0, agentHash ? 0 : 1).run();

    if (agentHash) {
      await env.DB.prepare(
        "INSERT INTO agent_activity_daily (day, agent_hash, protocol, client, first_seen_at, last_seen_at, request_count) VALUES (date('now'), ?1, ?2, ?3, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, 1) ON CONFLICT(day, agent_hash, protocol) DO UPDATE SET last_seen_at = CURRENT_TIMESTAMP, request_count = request_count + 1"
      ).bind(agentHash, classification.protocol, request.headers.get("x-accordtrace-client")?.slice(0, 80) ?? null).run();
    }
  } catch {
    // D1 telemetry is best-effort and must not interrupt proof or verification calls.
  }
}

function explicitAgentId(request) {
  for (const name of ["x-accordtrace-agent-id", "x-agent-id", "x-client-id"]) {
    const value = request.headers.get(name)?.trim();
    if (value && value.length <= 512) return value;
  }
  return null;
}

async function sha256(value) {
  const digest = await crypto.subtle.digest("SHA-256", encoder.encode(value));
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

async function publicStats(env) {
  if (!env.DB) return json({ error: "stats_unavailable" }, 503);
  try {
    const [totals, protocols, daily, active24h, active7d, active30d, requestKinds] = await Promise.all([
      env.DB.prepare("SELECT metric, SUM(count) AS count FROM usage_daily WHERE day >= date('now', '-29 days') AND external = 1 GROUP BY metric ORDER BY metric").all(),
      env.DB.prepare("SELECT protocol, SUM(count) AS count FROM usage_daily WHERE day >= date('now', '-29 days') AND metric = 'api_calls_total' AND external = 1 GROUP BY protocol ORDER BY protocol").all(),
      env.DB.prepare("SELECT day, SUM(CASE WHEN metric = 'api_calls_total' AND external = 1 THEN count ELSE 0 END) AS api_calls, SUM(CASE WHEN metric = 'proofs_created_total' AND external = 1 THEN count ELSE 0 END) AS proofs_created, SUM(CASE WHEN metric = 'verifications_total' AND external = 1 THEN count ELSE 0 END) AS verifications FROM usage_daily WHERE day >= date('now', '-29 days') GROUP BY day ORDER BY day").all(),
      env.DB.prepare("SELECT COUNT(DISTINCT agent_hash) AS count FROM agent_activity_daily WHERE last_seen_at >= datetime('now', '-24 hours')").first(),
      env.DB.prepare("SELECT COUNT(DISTINCT agent_hash) AS count FROM agent_activity_daily WHERE day >= date('now', '-6 days')").first(),
      env.DB.prepare("SELECT COUNT(DISTINCT agent_hash) AS count FROM agent_activity_daily WHERE day >= date('now', '-29 days')").first(),
      env.DB.prepare("SELECT SUM(identified) AS identified, SUM(anonymous) AS anonymous FROM agent_requests_daily WHERE day >= date('now', '-29 days')").first()
    ]);

    const totalMap = Object.fromEntries((totals.results ?? []).map((row) => [row.metric, Number(row.count ?? 0)]));
    const protocolMap = Object.fromEntries((protocols.results ?? []).map((row) => [row.protocol, Number(row.count ?? 0)]));

    return json({
      windowDays: 30,
      totals: totalMap,
      agents: {
        active: {
          active24h: Number(active24h?.count ?? 0),
          active7d: Number(active7d?.count ?? 0),
          active30d: Number(active30d?.count ?? 0)
        },
        requests: {
          identified: Number(requestKinds?.identified ?? 0),
          anonymous: Number(requestKinds?.anonymous ?? 0)
        },
        protocols: protocolMap
      },
      daily: (daily.results ?? []).map((row) => ({
        day: row.day,
        apiCalls: Number(row.api_calls ?? 0),
        proofsCreated: Number(row.proofs_created ?? 0),
        verifications: Number(row.verifications ?? 0)
      })),
      privacy: "Aggregate external usage only. Unique agents require an explicit agent/client identifier and are stored only as SHA-256 hashes. Raw IP addresses, API keys, prompts, request bodies and proof payloads are not stored in telemetry.",
      startedFrom: "Telemetry begins when this instrumentation is deployed; historical usage is not fabricated."
    });
  } catch (error) {
    return json({ error: "stats_unavailable", message: error.message }, 503);
  }
}

function json(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
      "access-control-allow-origin": "*",
      "x-content-type-options": "nosniff"
    }
  });
}
