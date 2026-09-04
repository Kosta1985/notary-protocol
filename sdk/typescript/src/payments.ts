export interface ServiceOfferInput {
  offer_id: string;
  seller_passport_id: string;
  service_action: string;
  target_origin: string;
  rail: "x402";
  network: string;
  asset: string;
  amount_atomic: string;
  platform_fee_atomic?: string;
  pay_to: string;
  valid_from: string;
  expires_at: string;
  terms_digest?: string | null;
}

export interface ServiceOrderInput {
  order_id: string;
  offer_id: string;
  buyer_passport_id: string;
  seller_passport_id: string;
  lease_id: string;
  rail: "x402";
  network: string;
  asset: string;
  amount_atomic: string;
  platform_fee_atomic?: string;
  ordered_at: string;
}

export interface X402VerifyInput {
  order_id: string;
  buyer_passport_id: string;
  payment_payload_digest: string;
  payment_requirements_digest: string;
  verified_at: string;
}

export function serviceOfferPayload(input: ServiceOfferInput): Record<string, unknown> {
  return {
    domain: "accordtrace.payment.service.offer.v1",
    offer_id: cleanId(input.offer_id),
    seller_passport_id: cleanId(input.seller_passport_id),
    service_action: normalizeAction(input.service_action),
    target_origin: normalizeOrigin(input.target_origin),
    rail: input.rail,
    network: cleanToken(input.network),
    asset: cleanToken(input.asset),
    amount_atomic: atomic(input.amount_atomic, false),
    platform_fee_atomic: atomic(input.platform_fee_atomic ?? "0", true),
    pay_to: cleanToken(input.pay_to),
    valid_from: input.valid_from,
    expires_at: new Date(input.expires_at).toISOString(),
    terms_digest: input.terms_digest?.trim() || null
  };
}

export function serviceOrderPayload(input: ServiceOrderInput): Record<string, unknown> {
  return {
    domain: "accordtrace.payment.service.order.v1",
    order_id: cleanId(input.order_id),
    offer_id: cleanId(input.offer_id),
    buyer_passport_id: cleanId(input.buyer_passport_id),
    seller_passport_id: cleanId(input.seller_passport_id),
    lease_id: cleanId(input.lease_id),
    rail: input.rail,
    network: cleanToken(input.network),
    asset: cleanToken(input.asset),
    amount_atomic: atomic(input.amount_atomic, false),
    platform_fee_atomic: atomic(input.platform_fee_atomic ?? "0", true),
    ordered_at: input.ordered_at
  };
}

export function x402VerifyPayload(input: X402VerifyInput): Record<string, unknown> {
  return {
    domain: "accordtrace.payment.x402.verify.v1",
    order_id: cleanId(input.order_id),
    buyer_passport_id: cleanId(input.buyer_passport_id),
    payment_payload_digest: cleanDigest(input.payment_payload_digest),
    payment_requirements_digest: cleanDigest(input.payment_requirements_digest),
    verified_at: input.verified_at
  };
}

export class AgentPaymentClient {
  private readonly baseUrl: string;
  constructor(baseUrl: string) { this.baseUrl = baseUrl.replace(/\/$/, ""); }
  async capabilities() { return this.request("/api/v1/payments/capabilities"); }
  async createOffer(input: ServiceOfferInput & { signature: string }) { return this.request("/api/v1/payments/offers", input); }
  async getOffer(id: string) { return this.request(`/api/v1/payments/offers/${encodeURIComponent(id)}`); }
  async createOrder(input: { order_id: string; offer_id: string; buyer_passport_id: string; lease_id: string; ordered_at: string; signature: string }) { return this.request("/api/v1/payments/orders", input); }
  async verifyX402(input: { order_id: string; buyer_passport_id: string; payment_payload: Record<string, unknown>; verified_at: string; signature: string }) { return this.request("/api/v1/payments/x402/verify", input); }
  async getOrder(id: string) { return this.request(`/api/v1/payments/orders/${encodeURIComponent(id)}`); }
  private async request(path: string, body?: unknown): Promise<Record<string, unknown>> {
    const response = await fetch(`${this.baseUrl}${path}`, body === undefined ? undefined : { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
    const result = await response.json() as Record<string, unknown> & { message?: string };
    if (!response.ok) throw new Error(result.message ?? `AccordTrace payment request failed (${response.status})`);
    return result;
  }
}

function cleanId(value: string) { const v = value.trim(); if (!/^[A-Za-z0-9][A-Za-z0-9._:-]{0,199}$/.test(v)) throw new TypeError("Invalid identifier"); return v; }
function cleanToken(value: string) { const v = value.trim(); if (!v || /[\r\n\0]/.test(v)) throw new TypeError("Invalid payment token field"); return v; }
function normalizeAction(value: string) { const v = value.trim().toLowerCase(); if (!/^[a-z0-9][a-z0-9:._/-]{0,99}$/.test(v)) throw new TypeError("Invalid service action"); return v; }
function normalizeOrigin(value: string) { const url = new URL(value); if (url.protocol !== "https:" || url.username || url.password) throw new TypeError("Service origin must be HTTPS"); return url.origin; }
function atomic(value: string, allowZero: boolean) { const v = value.trim(); if (!/^\d{1,78}$/.test(v)) throw new TypeError("Amount must use atomic integer units"); if (!allowZero && /^0+$/.test(v)) throw new TypeError("Amount must be positive"); return v.replace(/^0+(?=\d)/, ""); }
function cleanDigest(value: string) { const v = value.trim().toLowerCase(); if (!/^[a-f0-9]{64}$/.test(v)) throw new TypeError("Digest must be SHA-256 hex"); return v; }
