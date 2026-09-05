const EVENT_PATTERN = /^[a-z0-9_]{1,64}$/;

export async function recordUsage(env, event, { request = null, synthetic = false } = {}) {
  if (!EVENT_PATTERN.test(String(event ?? ""))) return false;
  if (synthetic) return false;
  if (request?.headers?.get?.("x-notary-monitor")) return false;
  try {
    await env.DB.prepare(
      "INSERT INTO analytics_daily (day, event, count) VALUES (date('now'), ?1, 1) ON CONFLICT(day, event) DO UPDATE SET count = count + 1"
    ).bind(event).run();
    return true;
  } catch {
    // Usage telemetry must never interrupt proof or interoperability operations.
    return false;
  }
}
