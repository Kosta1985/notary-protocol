import { handleGateway } from "./gateway.js";

export async function handlePaymentBoundGateway(request, env, url = new URL(request.url)) {
  if (!(request.method === "POST" && url.pathname === "/api/v1/gateway/authorize")) {
    return handleGateway(request, env, url);
  }

  const clone = request.clone();
  let body;
  try { body = await clone.json(); } catch { return handleGateway(request, env, url); }
  const leaseId = String(body?.lease_id ?? "").trim();
  if (!leaseId) return handleGateway(request, env, url);

  const order = await env.DB.prepare("SELECT id,payment_status FROM service_orders WHERE lease_id=?1 LIMIT 1").bind(leaseId).first();
  if (!order) return handleGateway(request, env, url);
  if (order.payment_status !== "payment_authorized") {
    return json({
      decision: {
        allowed: false,
        reason: order.payment_status === "consumed" ? "payment_already_consumed" : "payment_not_authorized",
        lease_id: leaseId,
        payment_order_id: order.id
      }
    }, 402);
  }

  const lease = await env.DB.prepare("SELECT id,subject_passport_id,allowed_actions_json,allowed_origins_json,status,expires_at,used_calls,max_calls FROM capability_leases WHERE id=?1").bind(leaseId).first();
  if (!lease) return json({ decision: { allowed: false, reason: "lease_not_found", lease_id: leaseId } }, 404);
  const action = normalizeAction(body.action);
  const origin = normalizeOrigin(body.target_origin);
  const actions = parseArray(lease.allowed_actions_json);
  const origins = parseArray(lease.allowed_origins_json);
  if (lease.status !== "active") return json({ decision: { allowed: false, reason: "lease_not_active", lease_id: leaseId } }, 409);
  if (Date.parse(lease.expires_at) <= Date.now()) return json({ decision: { allowed: false, reason: "lease_expired", lease_id: leaseId } }, 409);
  if (lease.subject_passport_id !== String(body.subject_passport_id ?? "")) return json({ decision: { allowed: false, reason: "subject_mismatch", lease_id: leaseId } }, 403);
  if (!actions.includes(action)) return json({ decision: { allowed: false, reason: "action_not_allowed", lease_id: leaseId } }, 403);
  if (!origins.includes(origin)) return json({ decision: { allowed: false, reason: "origin_not_allowed", lease_id: leaseId } }, 403);
  if (Number(lease.used_calls) >= Number(lease.max_calls)) return json({ decision: { allowed: false, reason: "quota_exhausted", lease_id: leaseId } }, 409);

  const consumedAt = new Date().toISOString();
  const consumed = await env.DB.prepare("UPDATE service_orders SET payment_status='consumed',consumed_at=?1,updated_at=?1 WHERE id=?2 AND payment_status='payment_authorized'")
    .bind(consumedAt, order.id).run();
  if ((consumed.meta?.changes ?? 0) !== 1) {
    return json({ decision: { allowed: false, reason: "payment_race_lost", lease_id: leaseId, payment_order_id: order.id } }, 409);
  }

  const response = await handleGateway(request, env, url);
  if (!response) {
    await rollback(env, order.id, consumedAt);
    return response;
  }
  let result = null;
  try { result = await response.clone().json(); } catch {}
  if (!response.ok || result?.decision?.allowed !== true) {
    await rollback(env, order.id, consumedAt);
    return response;
  }

  const enriched = {
    ...result,
    payment: {
      order_id: order.id,
      status: "consumed",
      settlement_status: "not_settled_by_accordtrace",
      custody: "none"
    }
  };
  return new Response(JSON.stringify(enriched), { status: response.status, headers: response.headers });
}

async function rollback(env, orderId, consumedAt) {
  await env.DB.prepare("UPDATE service_orders SET payment_status='payment_authorized',consumed_at=NULL,updated_at=?1 WHERE id=?2 AND payment_status='consumed' AND consumed_at=?1")
    .bind(consumedAt, orderId).run();
}
function normalizeAction(value) { return String(value ?? "").trim().toLowerCase(); }
function normalizeOrigin(value) { try { return new URL(String(value ?? "")).origin; } catch { return ""; } }
function parseArray(value) { try { return JSON.parse(value || "[]"); } catch { return []; } }
function json(body, status) { return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json; charset=utf-8" } }); }
