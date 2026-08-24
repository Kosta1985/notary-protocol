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
