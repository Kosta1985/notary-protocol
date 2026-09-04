import { createPaymentAdapter, PaymentAdapterError } from "./payment-adapters/index.js";

const JSON_HEADERS = { "content-type": "application/json; charset=utf-8" };
const MAX_CLOCK_SKEW_MS = 10 * 60 * 1000;
const MAX_OFFER_MS = 30 * 24 * 60 * 60 * 1000;
let schemaReady = false;

export async function handlePayments(request, env, url = new URL(request.url)) {
  if (!url.pathname.startsWith("/api/v1/payments/")) return null;
  await ensurePaymentSchema(env);

  if (request.method === "GET" && url.pathname === "/api/v1/payments/capabilities") {
    const enabled = String(env.X402_VERIFY_ENABLED ?? "false").toLowerCase() === "true";
    return reply({
      service: "AccordTrace Non-Custodial Payments",
      version: "0.1.0",
      features: ["signed_service_offers", "signed_buyer_orders", "x402_v2_verification", "payment_bound_capability_leases", "platform_fee_disclosure"],
      rails: { x402: { verify_enabled: enabled, settlement: "external" } },
      custody: "none",
      safety: "AccordTrace never requests wallet seed phrases or private keys and never stores raw x402 payment payloads. Only hashes and verification metadata are retained."
    });
  }

  if (request.method === "POST" && url.pathname === "/api/v1/payments/offers") {
    const body = await bodyJson(request);
    const seller = await requirePassport(env, body.seller_passport_id);
    const offerId = cleanId(body.offer_id, "offer_id");
    const serviceAction = normalizeAction(body.service_action);
    const targetOrigin = normalizeOrigin(body.target_origin);
    const rail = enumValue(body.rail, ["x402"], null);
    if (!rail) throw new PaymentError("unsupported payment rail", 400);
    const network = cleanToken(body.network, "network", 120);
    const asset = cleanToken(body.asset, "asset", 240);
    const amountAtomic = atomicAmount(body.amount_atomic, "amount_atomic");
    const platformFeeAtomic = atomicAmount(body.platform_fee_atomic ?? "0", "platform_fee_atomic", true);
    const payTo = cleanToken(body.pay_to, "pay_to", 240);
    required(body.valid_from, "valid_from");
    required(body.expires_at, "expires_at");
    required(body.signature, "signature");
    assertFresh(body.valid_from);
    const expiresAt = assertExpiry(body.valid_from, body.expires_at);
    const payload = {
      domain: "accordtrace.payment.service.offer.v1",
      offer_id: offerId,
      seller_passport_id: seller.id,
      service_action: serviceAction,
      target_origin: targetOrigin,
      rail,
      network,
      asset,
      amount_atomic: amountAtomic,
      platform_fee_atomic: platformFeeAtomic,
      pay_to: payTo,
      valid_from: body.valid_from,
      expires_at: expiresAt,
      terms_digest: nullable(body.terms_digest, 256)
    };
    await verifyEd25519(seller.public_key, canonicalize(payload), body.signature);
    const now = new Date().toISOString();
    const result = await env.DB.prepare(`INSERT OR IGNORE INTO service_offers
      (id,seller_passport_id,service_action,target_origin,rail,network,asset,amount_atomic,platform_fee_atomic,pay_to,valid_from,expires_at,terms_digest,signature,status,created_at,updated_at)
      VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9,?10,?11,?12,?13,?14,'active',?15,?15)`)
      .bind(offerId, seller.id, serviceAction, targetOrigin, rail, network, asset, amountAtomic, platformFeeAtomic, payTo, body.valid_from, expiresAt, payload.terms_digest, text(body.signature, 1000), now).run();
    if ((result.meta?.changes ?? 1) === 0) return reply({ error: "offer_already_exists" }, 409);
    return reply({ offer: offerView(await getOffer(env, offerId)) }, 201);
  }

  const offerMatch = url.pathname.match(/^\/api\/v1\/payments\/offers\/([^/]+)$/);
  if (request.method === "GET" && offerMatch) {
    const offer = await getOffer(env, decodeURIComponent(offerMatch[1]));
    return offer ? reply({ offer: offerView(offer) }) : reply({ error: "offer_not_found" }, 404);
  }

  if (request.method === "POST" && url.pathname === "/api/v1/payments/orders") {
    const body = await bodyJson(request);
    const orderId = cleanId(body.order_id, "order_id");
    const offerId = cleanId(body.offer_id, "offer_id");
    const buyer = await requirePassport(env, body.buyer_passport_id);
    const leaseId = cleanId(body.lease_id, "lease_id");
    required(body.ordered_at, "ordered_at");
    required(body.signature, "signature");
    assertFresh(body.ordered_at);
    const offer = await getOffer(env, offerId);
    if (!offer || offer.status !== "active") return reply({ error: "offer_not_active" }, 404);
    if (Date.parse(offer.valid_from) > Date.now() || Date.parse(offer.expires_at) <= Date.now()) return reply({ error: "offer_expired" }, 409);
    if (offer.seller_passport_id === buyer.id) throw new PaymentError("buyer and seller must use different Passports", 400);
    const lease = await env.DB.prepare("SELECT id,issuer_passport_id,subject_passport_id,allowed_actions_json,allowed_origins_json,max_calls,status,expires_at FROM capability_leases WHERE id=?1").bind(leaseId).first();
    if (!lease) return reply({ error: "lease_not_found" }, 404);
    if (lease.status !== "active") return reply({ error: "lease_not_active" }, 409);
    if (lease.issuer_passport_id !== offer.seller_passport_id || lease.subject_passport_id !== buyer.id) return reply({ error: "lease_parties_mismatch" }, 422);
    if (Number(lease.max_calls) !== 1) return reply({ error: "paid_lease_must_allow_exactly_one_call" }, 422);
    if (!parseArray(lease.allowed_actions_json).includes(offer.service_action) || !parseArray(lease.allowed_origins_json).includes(offer.target_origin)) return reply({ error: "lease_scope_mismatch" }, 422);
    if (Date.parse(lease.expires_at) > Date.parse(offer.expires_at)) return reply({ error: "lease_outlives_offer" }, 422);

    const payload = {
      domain: "accordtrace.payment.service.order.v1",
      order_id: orderId,
      offer_id: offer.id,
      buyer_passport_id: buyer.id,
      seller_passport_id: offer.seller_passport_id,
      lease_id: leaseId,
      rail: offer.rail,
      network: offer.network,
      asset: offer.asset,
      amount_atomic: offer.amount_atomic,
      platform_fee_atomic: offer.platform_fee_atomic,
      ordered_at: body.ordered_at
    };
    await verifyEd25519(buyer.public_key, canonicalize(payload), body.signature);
    const now = new Date().toISOString();
    const result = await env.DB.prepare(`INSERT OR IGNORE INTO service_orders
      (id,offer_id,buyer_passport_id,seller_passport_id,lease_id,payment_status,buyer_signature,ordered_at,created_at,updated_at)
      VALUES (?1,?2,?3,?4,?5,'payment_claim',?6,?7,?8,?8)`)
      .bind(orderId, offer.id, buyer.id, offer.seller_passport_id, leaseId, text(body.signature, 1000), body.ordered_at, now).run();
    if ((result.meta?.changes ?? 1) === 0) return reply({ error: "order_or_lease_already_bound" }, 409);
    return reply({ order: orderView(await getOrder(env, orderId)), payment_requirements: x402Requirements(offer, orderId) }, 201);
  }

  if (request.method === "POST" && url.pathname === "/api/v1/payments/x402/verify") {
    const body = await bodyJson(request);
    const orderId = cleanId(body.order_id, "order_id");
    const buyer = await requirePassport(env, body.buyer_passport_id);
    const order = await getOrder(env, orderId);
    if (!order) return reply({ error: "order_not_found" }, 404);
    if (order.buyer_passport_id !== buyer.id) return reply({ error: "buyer_mismatch" }, 403);
    if (!["payment_claim", "rejected"].includes(order.payment_status)) return reply({ error: "order_not_verifiable_in_current_state" }, 409);
    required(body.verified_at, "verified_at");
    required(body.signature, "signature");
    assertFresh(body.verified_at);
    const offer = await getOffer(env, order.offer_id);
    if (!offer || offer.status !== "active" || Date.parse(offer.expires_at) <= Date.now()) return reply({ error: "offer_not_active" }, 409);
    const paymentPayload = body.payment_payload;
    if (!paymentPayload || typeof paymentPayload !== "object" || Array.isArray(paymentPayload)) throw new PaymentError("payment_payload must be an object", 400);
    const paymentPayloadDigest = await sha256(canonicalize(paymentPayload));
    const requirements = x402Requirements(offer, order.id);
    const requirementsDigest = await sha256(canonicalize(requirements));
    const signedPayload = {
      domain: "accordtrace.payment.x402.verify.v1",
      order_id: order.id,
      buyer_passport_id: buyer.id,
      payment_payload_digest: paymentPayloadDigest,
      payment_requirements_digest: requirementsDigest,
      verified_at: body.verified_at
    };
    await verifyEd25519(buyer.public_key, canonicalize(signedPayload), body.signature);
    let verification;
    try {
      verification = await createPaymentAdapter(env, "x402").verify({
        paymentPayload,
        paymentRequirements: requirements,
        paymentHeaderDigest: paymentPayloadDigest
      });
    } catch (error) {
      if (error instanceof PaymentAdapterError) throw new PaymentError(error.message, error.status, error.details);
      throw error;
    }
    const now = new Date().toISOString();
    const status = verification.valid ? "payment_authorized" : "rejected";
    await env.DB.prepare(`UPDATE service_orders SET payment_status=?1,payment_payload_digest=?2,payment_requirements_digest=?3,facilitator=?4,payer_ref=?5,authorized_at=?6,updated_at=?7 WHERE id=?8`)
      .bind(status, paymentPayloadDigest, requirementsDigest, verification.facilitator, verification.payer, verification.valid ? body.verified_at : null, now, order.id).run();
    return reply({
      order: orderView(await getOrder(env, order.id)),
      verification: {
        valid: verification.valid,
        rail: "x402",
        invalid_reason: verification.invalid_reason,
        settlement_status: "not_settled_by_accordtrace",
        custody: "none"
      }
    }, verification.valid ? 200 : 402);
  }

  const orderMatch = url.pathname.match(/^\/api\/v1\/payments\/orders\/([^/]+)$/);
  if (request.method === "GET" && orderMatch) {
    const order = await getOrder(env, decodeURIComponent(orderMatch[1]));
    return order ? reply({ order: orderView(order) }) : reply({ error: "order_not_found" }, 404);
  }

  return reply({ error: "not_found" }, 404);
}

export async function paymentGateForLease(env, leaseId) {
  await ensurePaymentSchema(env);
  const order = await env.DB.prepare("SELECT id,payment_status FROM service_orders WHERE lease_id=?1 LIMIT 1").bind(leaseId).first();
  if (!order) return { required: false, allowed: true, reason: null, order_id: null };
  return {
    required: true,
    allowed: order.payment_status === "payment_authorized",
    reason: order.payment_status === "payment_authorized" ? null : "payment_not_authorized",
    order_id: order.id
  };
}

export async function consumePaymentOrder(env, leaseId, consumedAt) {
  const result = await env.DB.prepare("UPDATE service_orders SET payment_status='consumed',consumed_at=?1,updated_at=?1 WHERE lease_id=?2 AND payment_status='payment_authorized'")
    .bind(consumedAt, leaseId).run();
  return (result.meta?.changes ?? 0) === 1;
}

function x402Requirements(offer, orderId) {
  return {
    scheme: "exact",
    network: offer.network,
    amount: offer.amount_atomic,
    asset: offer.asset,
    payTo: offer.pay_to,
    maxTimeoutSeconds: Math.max(1, Math.min(3600, Math.floor((Date.parse(offer.expires_at) - Date.now()) / 1000))),
    extra: {
      accordTraceOrderId: orderId,
      platformFeeAtomic: offer.platform_fee_atomic
    }
  };
}
async function getOffer(env, id) { return env.DB.prepare("SELECT * FROM service_offers WHERE id=?1").bind(id).first(); }
async function getOrder(env, id) { return env.DB.prepare("SELECT * FROM service_orders WHERE id=?1").bind(id).first(); }
function offerView(row) { if (!row) return null; return { id: row.id, seller_passport_id: row.seller_passport_id, service_action: row.service_action, target_origin: row.target_origin, rail: row.rail, network: row.network, asset: row.asset, amount_atomic: row.amount_atomic, platform_fee_atomic: row.platform_fee_atomic, pay_to: row.pay_to, valid_from: row.valid_from, expires_at: row.expires_at, terms_digest: row.terms_digest, status: row.status, created_at: row.created_at, updated_at: row.updated_at }; }
function orderView(row) { if (!row) return null; return { id: row.id, offer_id: row.offer_id, buyer_passport_id: row.buyer_passport_id, seller_passport_id: row.seller_passport_id, lease_id: row.lease_id, payment_status: row.payment_status, payment_payload_digest: row.payment_payload_digest, payment_requirements_digest: row.payment_requirements_digest, facilitator: row.facilitator, payer_ref: row.payer_ref, ordered_at: row.ordered_at, authorized_at: row.authorized_at, consumed_at: row.consumed_at, created_at: row.created_at, updated_at: row.updated_at }; }
async function requirePassport(env, id) { required(id, "passport_id"); const passport = await env.DB.prepare("SELECT id,public_key,status FROM agent_passports WHERE id=?1").bind(id).first(); if (!passport) throw new PaymentError("passport_not_found", 404); if (passport.status !== "active") throw new PaymentError("passport_not_active", 403); return passport; }
async function ensurePaymentSchema(env) { if (schemaReady) return; const statements = [
  `CREATE TABLE IF NOT EXISTS service_offers (id TEXT PRIMARY KEY,seller_passport_id TEXT NOT NULL,service_action TEXT NOT NULL,target_origin TEXT NOT NULL,rail TEXT NOT NULL,network TEXT NOT NULL,asset TEXT NOT NULL,amount_atomic TEXT NOT NULL,platform_fee_atomic TEXT NOT NULL DEFAULT '0',pay_to TEXT NOT NULL,valid_from TEXT NOT NULL,expires_at TEXT NOT NULL,terms_digest TEXT,signature TEXT NOT NULL,status TEXT NOT NULL DEFAULT 'active',created_at TEXT NOT NULL,updated_at TEXT NOT NULL)`,
  `CREATE TABLE IF NOT EXISTS service_orders (id TEXT PRIMARY KEY,offer_id TEXT NOT NULL,buyer_passport_id TEXT NOT NULL,seller_passport_id TEXT NOT NULL,lease_id TEXT NOT NULL UNIQUE,payment_status TEXT NOT NULL DEFAULT 'payment_claim',payment_payload_digest TEXT,payment_requirements_digest TEXT,payment_reference_digest TEXT,facilitator TEXT,payer_ref TEXT,buyer_signature TEXT NOT NULL,ordered_at TEXT NOT NULL,authorized_at TEXT,consumed_at TEXT,created_at TEXT NOT NULL,updated_at TEXT NOT NULL)`,
  `CREATE INDEX IF NOT EXISTS idx_service_orders_buyer_status ON service_orders(buyer_passport_id,payment_status,created_at DESC)`
]; if (typeof env.DB.batch === "function") await env.DB.batch(statements.map((sql)=>env.DB.prepare(sql))); else for (const sql of statements) await env.DB.prepare(sql).run(); schemaReady = true; }
function cleanId(value,name){const result=String(value??"").trim();if(!/^[A-Za-z0-9][A-Za-z0-9._:-]{0,199}$/.test(result))throw new PaymentError(`${name} format is invalid`,400);return result}
function cleanToken(value,name,max){const result=String(value??"").trim();if(!result||result.length>max||/[\r\n\0]/.test(result))throw new PaymentError(`${name} format is invalid`,400);return result}
function atomicAmount(value,name,allowZero=false){const result=String(value??"").trim();if(!/^\d{1,78}$/.test(result))throw new PaymentError(`${name} must be an integer string in atomic units`,400);if(!allowZero&&/^0+$/.test(result))throw new PaymentError(`${name} must be greater than zero`,400);return result.replace(/^0+(?=\d)/,"")}
function normalizeAction(value){const result=String(value??"").trim().toLowerCase();if(!/^[a-z0-9][a-z0-9:._/-]{0,99}$/.test(result))throw new PaymentError("action format is invalid",400);return result}
function normalizeOrigin(value){try{const url=new URL(String(value??""));if(url.protocol!=="https:"||url.username||url.password)throw new Error();return url.origin}catch{throw new PaymentError("target_origin must be a valid HTTPS origin",400)}}
function assertExpiry(validFrom,expiresAt){const start=Date.parse(validFrom),end=Date.parse(expiresAt);if(!Number.isFinite(start)||!Number.isFinite(end)||end<=start||end-start>MAX_OFFER_MS)throw new PaymentError("offer expiry is invalid or exceeds 30 days",400);return new Date(end).toISOString()}
function assertFresh(value){const time=Date.parse(value);if(!Number.isFinite(time)||Math.abs(Date.now()-time)>MAX_CLOCK_SKEW_MS)throw new PaymentError("timestamp is outside allowed clock skew",400)}
function enumValue(value,values,fallback){return values.includes(value)?value:fallback}
function parseArray(value){try{return JSON.parse(value||"[]")}catch{return[]}}
function nullable(value,max){const result=String(value??"").trim().slice(0,max);return result||null}
function required(value,name){if(!String(value??"").trim())throw new PaymentError(`${name} is required`,400)}
function text(value,max){return String(value??"").trim().slice(0,max)}
async function bodyJson(request){try{return await request.json()}catch{throw new PaymentError("request body must be JSON",400)}}
async function verifyEd25519(publicKeyPem,message,signature){let key;try{key=await crypto.subtle.importKey("spki",pemBytes(publicKeyPem),{name:"Ed25519"},false,["verify"])}catch{throw new PaymentError("passport public key is invalid",422)}let ok=false;try{ok=await crypto.subtle.verify({name:"Ed25519"},key,base64urlBytes(signature),new TextEncoder().encode(message))}catch{}if(!ok)throw new PaymentError("signature verification failed",401)}
function pemBytes(pem){const base64=String(pem??"").replace(/-----BEGIN PUBLIC KEY-----|-----END PUBLIC KEY-----|\s/g,"");return Uint8Array.from(atob(base64),(c)=>c.charCodeAt(0))}
function base64urlBytes(value){const normalized=String(value??"").replace(/-/g,"+").replace(/_/g,"/");const padded=normalized+"=".repeat((4-normalized.length%4)%4);return Uint8Array.from(atob(padded),(c)=>c.charCodeAt(0))}
function canonicalize(value){if(value===null||typeof value==="boolean")return JSON.stringify(value);if(typeof value==="string")return JSON.stringify(value);if(typeof value==="number"){if(!Number.isFinite(value))throw new PaymentError("non-finite number",400);return JSON.stringify(Object.is(value,-0)?0:value)}if(Array.isArray(value))return `[${value.map(canonicalize).join(",")}]`;if(typeof value==="object")return `{${Object.keys(value).sort().map((key)=>`${JSON.stringify(key)}:${canonicalize(value[key])}`).join(",")}}`;throw new PaymentError("unsupported canonical value",400)}
async function sha256(value){const digest=await crypto.subtle.digest("SHA-256",new TextEncoder().encode(value));return [...new Uint8Array(digest)].map((b)=>b.toString(16).padStart(2,"0")).join("")}
function reply(body,status=200){return new Response(JSON.stringify(body),{status,headers:JSON_HEADERS})}
export class PaymentError extends Error{constructor(message,status=400,details=null){super(message);this.status=status;this.details=details}}
