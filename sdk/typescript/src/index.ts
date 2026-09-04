export type Role = "initiator" | "counterparty";

export interface Party {
  id: string;
  publicKey: string;
}

export interface DealEnvelope {
  version: "0.1";
  id: string;
  createdAt: string;
  expiresAt?: string | null;
  initiator: Party;
  counterparty: Party;
  offer: { id: string; createdAt: string; nonce: string; terms: Record<string, unknown> };
  acceptance: { offerId: string; acceptedAt: string; nonce: string };
  signatures: Array<{ role: Role; algorithm: "Ed25519"; value: string }>;
}

export interface VerificationCheck {
  code: string;
  passed: boolean;
}

export interface NotaryReceipt {
  version: "0.1";
  id: string;
  dealId: string;
  evidenceDigest: string;
  verifiedAt: string;
  valid: boolean;
  checks: VerificationCheck[];
  violations: string[];
  notary: { algorithm: "Ed25519"; publicKey: string; signature: string };
}

export interface AgentPassportProfile {
  public_key: string;
  marketplace_agent_id?: string | null;
  identity_ref?: string | null;
  payment_endpoint?: string | null;
  payment_methods?: string[];
  issued_at: string;
}

export interface SignedAgentPassportProfile extends AgentPassportProfile {
  signature: string;
}

export interface SecurityEventInput {
  passport_id: string;
  event_id: string;
  type: "tool_scope_violation" | "network_policy_violation" | "secret_access_attempt" | "identity_mismatch" | "payment_anomaly" | "containment" | "recovery" | "observation";
  severity: number;
  evidence_digest?: string | null;
  proof_id?: string | null;
  metadata?: Record<string, string | number | boolean>;
  observed_at: string;
}

export interface SignedSecurityEvent extends SecurityEventInput {
  signature: string;
}

export function canonicalize(value: unknown): string {
  if (value === null || typeof value === "boolean") return JSON.stringify(value);
  if (typeof value === "string") {
    assertWellFormedUnicode(value);
    return JSON.stringify(value);
  }
  if (typeof value === "number") {
    if (!Number.isFinite(value)) throw new TypeError("Non-finite numbers are not canonical JSON");
    return JSON.stringify(Object.is(value, -0) ? 0 : value);
  }
  if (Array.isArray(value)) return `[${value.map(canonicalize).join(",")}]`;
  if (typeof value === "object") {
    const object = value as Record<string, unknown>;
    return `{${Object.keys(object).sort().map((key) => {
      assertWellFormedUnicode(key);
      return `${JSON.stringify(key)}:${canonicalize(object[key])}`;
    }).join(",")}}`;
  }
  throw new TypeError(`Unsupported canonical JSON value: ${typeof value}`);
}

function assertWellFormedUnicode(value: string): void {
  for (let index = 0; index < value.length; index += 1) {
    const code = value.charCodeAt(index);
    if (code >= 0xd800 && code <= 0xdbff) {
      const next = value.charCodeAt(index + 1);
      if (!(next >= 0xdc00 && next <= 0xdfff)) throw new TypeError("Lone surrogate is not canonical JSON");
      index += 1;
    } else if (code >= 0xdc00 && code <= 0xdfff) throw new TypeError("Lone surrogate is not canonical JSON");
  }
}

export function signingPayload(envelope: DealEnvelope, role: Role): Record<string, unknown> {
  const payload: Record<string, unknown> = {
    domain: `notary.deal.${role}.v0.1`,
    version: envelope.version,
    dealId: envelope.id,
    createdAt: envelope.createdAt,
    expiresAt: envelope.expiresAt ?? null,
    initiator: envelope.initiator,
    counterparty: envelope.counterparty,
    offer: envelope.offer
  };
  if (role === "counterparty") payload.acceptance = envelope.acceptance;
  return payload;
}

export async function passportIdFromSpkiPem(publicKeyPem: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", spkiPemBytes(publicKeyPem));
  return `agtp_${[...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("")}`;
}

export async function passportProfilePayload(profile: AgentPassportProfile): Promise<Record<string, unknown>> {
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

export function securityEventPayload(event: SecurityEventInput): Record<string, unknown> {
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

export async function signSecurityPayload(privateKey: CryptoKey, payload: Record<string, unknown>): Promise<string> {
  const signature = await crypto.subtle.sign("Ed25519", privateKey, new TextEncoder().encode(canonicalize(payload)));
  return base64url(new Uint8Array(signature));
}

function spkiPemBytes(pem: string): Uint8Array {
  const match = pem.match(/-----BEGIN PUBLIC KEY-----([\s\S]+?)-----END PUBLIC KEY-----/);
  if (!match) throw new TypeError("Expected SPKI PEM public key");
  const binary = atob(match[1].replace(/\s+/g, ""));
  return Uint8Array.from(binary, (char) => char.charCodeAt(0));
}

function base64url(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

export class NotaryClient {
  constructor(private readonly baseUrl: string) {}

  async verify(envelope: DealEnvelope): Promise<NotaryReceipt> {
    const response = await fetch(`${this.baseUrl.replace(/\/$/, "")}/v1/verify`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(envelope)
    });
    const receipt = await response.json() as NotaryReceipt & { message?: string };
    if (!receipt.checks) throw new Error(receipt.message ?? `Notary request failed (${response.status})`);
    return receipt;
  }

  async getReceipt(id: string): Promise<NotaryReceipt> {
    const response = await fetch(`${this.baseUrl.replace(/\/$/, "")}/v1/receipts/${encodeURIComponent(id)}`);
    if (!response.ok) throw new Error(`Receipt not found (${response.status})`);
    return response.json() as Promise<NotaryReceipt>;
  }

  async verifyReceipt(receipt: NotaryReceipt): Promise<{ valid: boolean; checks: VerificationCheck[]; receiptId: string | null }> {
    const response = await fetch(`${this.baseUrl.replace(/\/$/, "")}/v1/receipts/verify`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(receipt)
    });
    return response.json() as Promise<{ valid: boolean; checks: VerificationCheck[]; receiptId: string | null }>;
  }
}

export class AgentSecurityClient {
  private readonly baseUrl: string;

  constructor(baseUrl: string) {
    this.baseUrl = baseUrl.replace(/\/$/, "");
  }

  async capabilities(): Promise<Record<string, unknown>> {
    return this.request("/api/v1/security/capabilities");
  }

  async upsertPassport(profile: SignedAgentPassportProfile): Promise<Record<string, unknown>> {
    return this.request("/api/v1/security/passports", profile);
  }

  async getPassport(passportId: string): Promise<Record<string, unknown>> {
    return this.request(`/api/v1/security/passports/${encodeURIComponent(passportId)}`);
  }

  async recordEvent(event: SignedSecurityEvent): Promise<Record<string, unknown>> {
    return this.request("/api/v1/security/events", event);
  }

  async createCanary(request: { passport_id: string; label: string; issued_at: string; signature: string }): Promise<Record<string, unknown>> {
    return this.request("/api/v1/security/canaries", request);
  }

  async checkCanary(token: string): Promise<Record<string, unknown>> {
    return this.request("/api/v1/security/canaries/check", { token });
  }

  private async request(path: string, body?: unknown): Promise<Record<string, unknown>> {
    const response = await fetch(`${this.baseUrl}${path}`, body === undefined ? undefined : {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body)
    });
    const result = await response.json() as Record<string, unknown> & { message?: string };
    if (!response.ok) throw new Error(result.message ?? `AccordTrace security request failed (${response.status})`);
    return result;
  }
}
