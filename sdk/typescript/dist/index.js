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

export async function passportIdFromSpkiPem(publicKeyPem) {
  const digest = await crypto.subtle.digest("SHA-256", spkiPemBytes(publicKeyPem));
  return `agtp_${[...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("")}`;
}

export async function passportProfilePayload(profile) {
  const passportId = await passportIdFromSpkiPem(profile.public_key);
  return {
    domain: "accordtrace.passport.profile.v1",
    passport_id: passportId,
    public_key: profile.public_key,
    marketplace_agent_id: profile.marketplace_agent_id ?? null,
    identity_ref: profile.identity_ref ?? null,
    payment_endpoint: profile.payment_endpoint ?? null,
    payment_methods: profile.payment_methods ?? [],
    issued_at: profile.issued_at
  };
}

export function securityEventPayload(event) {
  return {
    domain: "accordtrace.security.event.v1",
    passport_id: event.passport_id,
    event_id: event.event_id,
    type: event.type,
    severity: event.severity,
    evidence_digest: event.evidence_digest ?? null,
    proof_id: event.proof_id ?? null,
    source: "self",
    metadata: event.metadata ?? {},
    observed_at: event.observed_at
  };
}

export async function signSecurityPayload(privateKey, payload) {
  const signature = await crypto.subtle.sign("Ed25519", privateKey, new TextEncoder().encode(canonicalize(payload)));
  return base64url(new Uint8Array(signature));
}

function spkiPemBytes(pem) {
  const match = pem.match(/-----BEGIN PUBLIC KEY-----([\s\S]+?)-----END PUBLIC KEY-----/);
  if (!match) throw new TypeError("Expected SPKI PEM public key");
  const binary = atob(match[1].replace(/\s+/g, ""));
  return Uint8Array.from(binary, (char) => char.charCodeAt(0));
}

function base64url(bytes) {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
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

export class AgentSecurityClient {
  constructor(baseUrl) { this.baseUrl = baseUrl.replace(/\/$/, ""); }
  async capabilities() { return this.request("/api/v1/security/capabilities"); }
  async upsertPassport(profile) { return this.request("/api/v1/security/passports", profile); }
  async getPassport(passportId) { return this.request(`/api/v1/security/passports/${encodeURIComponent(passportId)}`); }
  async recordEvent(event) { return this.request("/api/v1/security/events", event); }
  async createCanary(request) { return this.request("/api/v1/security/canaries", request); }
  async checkCanary(token) { return this.request("/api/v1/security/canaries/check", { token }); }
  async request(path, body) {
    const response = await fetch(`${this.baseUrl}${path}`, body === undefined ? undefined : { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
    const result = await response.json();
    if (!response.ok) throw new Error(result.message ?? `AccordTrace security request failed (${response.status})`);
    return result;
  }
}
