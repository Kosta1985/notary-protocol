const EVENTS = new Set([
  "proof_created",
  "proof_retrieved",
  "proof_hash_computed",
  "proof_verify_started",
  "proof_verify_valid",
  "proof_verify_invalid",
  "a2a_request",
  "mcp_request"
]);

export async function recordAggregateEvent(env, event, request = null) {
  if (!EVENTS.has(event)) return;
  if (request?.headers?.get("x-notary-monitor") === "live-smoke") return;
  try {
    await env.DB.prepare(
      "INSERT INTO analytics_daily (day, event, count) VALUES (date('now'), ?1, 1) ON CONFLICT(day, event) DO UPDATE SET count = count + 1"
    ).bind(event).run();
  } catch {
    // Aggregate telemetry must never interrupt protocol behavior.
  }
}
