export function serviceOfferPayload(input) {
  return {
    domain: "accordtrace.payment.service.offer.v1",
    offer_id: cleanId(input.offer_id), seller_passport_id: cleanId(input.seller_passport_id),
    service_action: normalizeAction(input.service_action), target_origin: normalizeOrigin(input.target_origin),
    rail: input.rail, network: cleanToken(input.network), asset: cleanToken(input.asset),
    amount_atomic: atomic(input.amount_atomic, false), platform_fee_atomic: atomic(input.platform_fee_atomic ?? "0", true),
    pay_to: cleanToken(input.pay_to), valid_from: input.valid_from,
    expires_at: new Date(input.expires_at).toISOString(), terms_digest: input.terms_digest?.trim() || null
  };
}
export function serviceOrderPayload(input) {
  return {
    domain: "accordtrace.payment.service.order.v1", order_id: cleanId(input.order_id), offer_id: cleanId(input.offer_id),
    buyer_passport_id: cleanId(input.buyer_passport_id), seller_passport_id: cleanId(input.seller_passport_id),
    lease_id: cleanId(input.lease_id), rail: input.rail, network: cleanToken(input.network), asset: cleanToken(input.asset),
    amount_atomic: atomic(input.amount_atomic, false), platform_fee_atomic: atomic(input.platform_fee_atomic ?? "0", true), ordered_at: input.ordered_at
  };
}
export function x402VerifyPayload(input) {
  return { domain: "accordtrace.payment.x402.verify.v1", order_id: cleanId(input.order_id), buyer_passport_id: cleanId(input.buyer_passport_id), payment_payload_digest: cleanDigest(input.payment_payload_digest), payment_requirements_digest: cleanDigest(input.payment_requirements_digest), verified_at: input.verified_at };
}
export class AgentPaymentClient {
  constructor(baseUrl) { this.baseUrl = baseUrl.replace(/\/$/, ""); }
  async capabilities() { return this.request("/api/v1/payments/capabilities"); }
  async createOffer(input) { return this.request("/api/v1/payments/offers", input); }
  async getOffer(id) { return this.request(`/api/v1/payments/offers/${encodeURIComponent(id)}`); }
  async createOrder(input) { return this.request("/api/v1/payments/orders", input); }
  async verifyX402(input) { return this.request("/api/v1/payments/x402/verify", input); }
  async getOrder(id) { return this.request(`/api/v1/payments/orders/${encodeURIComponent(id)}`); }
  async request(path, body) { const response = await fetch(`${this.baseUrl}${path}`, body === undefined ? undefined : { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) }); const result = await response.json(); if (!response.ok) throw new Error(result.message ?? `AccordTrace payment request failed (${response.status})`); return result; }
}
function cleanId(value) { const v = value.trim(); if (!/^[A-Za-z0-9][A-Za-z0-9._:-]{0,199}$/.test(v)) throw new TypeError("Invalid identifier"); return v; }
function cleanToken(value) { const v = value.trim(); if (!v || /[\r\n\0]/.test(v)) throw new TypeError("Invalid payment token field"); return v; }
function normalizeAction(value) { const v = value.trim().toLowerCase(); if (!/^[a-z0-9][a-z0-9:._/-]{0,99}$/.test(v)) throw new TypeError("Invalid service action"); return v; }
function normalizeOrigin(value) { const url = new URL(value); if (url.protocol !== "https:" || url.username || url.password) throw new TypeError("Service origin must be HTTPS"); return url.origin; }
function atomic(value, allowZero) { const v = value.trim(); if (!/^\d{1,78}$/.test(v)) throw new TypeError("Amount must use atomic integer units"); if (!allowZero && /^0+$/.test(v)) throw new TypeError("Amount must be positive"); return v.replace(/^0+(?=\d)/, ""); }
function cleanDigest(value) { const v = value.trim().toLowerCase(); if (!/^[a-f0-9]{64}$/.test(v)) throw new TypeError("Digest must be SHA-256 hex"); return v; }
