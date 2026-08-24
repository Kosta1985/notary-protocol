export function canonicalize(value) {
  if (value === null || typeof value === "boolean") return JSON.stringify(value);
  if (typeof value === "string") { assertWellFormedUnicode(value); return JSON.stringify(value); }
  if (typeof value === "number") {
    if (!Number.isFinite(value)) throw new TypeError("Non-finite numbers are not canonical JSON");
    return JSON.stringify(Object.is(value, -0) ? 0 : value);
  }
  if (Array.isArray(value)) return `[${value.map(canonicalize).join(",")}]`;
  if (typeof value === "object") return `{${Object.keys(value).sort().map((key) => { assertWellFormedUnicode(key); return `${JSON.stringify(key)}:${canonicalize(value[key])}`; }).join(",")}}`;
  throw new TypeError(`Unsupported canonical JSON value: ${typeof value}`);
}

function assertWellFormedUnicode(value) {
  for (let index = 0; index < value.length; index += 1) {
    const code = value.charCodeAt(index);
    if (code >= 0xd800 && code <= 0xdbff) {
      const next = value.charCodeAt(index + 1);
      if (!(next >= 0xdc00 && next <= 0xdfff)) throw new TypeError("Lone surrogate is not canonical JSON");
      index += 1;
    } else if (code >= 0xdc00 && code <= 0xdfff) throw new TypeError("Lone surrogate is not canonical JSON");
  }
}

export function signingPayload(envelope, role) {
  const payload = {
    domain: `notary.deal.${role}.v0.1`, version: envelope.version, dealId: envelope.id,
    createdAt: envelope.createdAt, expiresAt: envelope.expiresAt ?? null,
    initiator: envelope.initiator, counterparty: envelope.counterparty, offer: envelope.offer
  };
  if (role === "counterparty") payload.acceptance = envelope.acceptance;
  return payload;
}

export class NotaryClient {
  constructor(baseUrl) { this.baseUrl = baseUrl.replace(/\/$/, ""); }
  async verify(envelope) {
    const response = await fetch(`${this.baseUrl}/v1/verify`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(envelope) });
    const receipt = await response.json();
    if (!receipt.checks) throw new Error(receipt.message ?? `Notary request failed (${response.status})`);
    return receipt;
  }
  async getReceipt(id) {
    const response = await fetch(`${this.baseUrl}/v1/receipts/${encodeURIComponent(id)}`);
    if (!response.ok) throw new Error(`Receipt not found (${response.status})`);
    return response.json();
  }
  async verifyReceipt(receipt) {
    const response = await fetch(`${this.baseUrl}/v1/receipts/verify`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(receipt) });
    return response.json();
  }
}
