export interface CapabilityLeaseInput {
  lease_id: string;
  issuer_passport_id: string;
  subject_passport_id: string;
  allowed_actions: string[];
  allowed_origins: string[];
  max_calls: number;
  issued_at: string;
  expires_at: string;
}

export interface AuthorizationRequestInput {
  request_id: string;
  lease_id: string;
  subject_passport_id: string;
  action: string;
  target_origin: string;
  observed_at: string;
}

export interface RevokeLeaseInput {
  lease_id: string;
  issuer_passport_id: string;
  reason?: string | null;
  revoked_at: string;
}

export interface LeaseStatusInput {
  lease_id: string;
  passport_id: string;
  checked_at: string;
}

export function capabilityLeasePayload(input: CapabilityLeaseInput): Record<string, unknown> {
  const actions = [...new Set(input.allowed_actions.map(normalizeAction))].sort();
  const origins = [...new Set(input.allowed_origins.map(normalizeOrigin))].sort();
  return {
    domain: "accordtrace.gateway.capability.lease.v1",
    lease_id: input.lease_id,
    issuer_passport_id: input.issuer_passport_id,
    subject_passport_id: input.subject_passport_id,
    allowed_actions: actions,
    allowed_origins: origins,
    max_calls: input.max_calls,
    issued_at: input.issued_at,
    expires_at: new Date(input.expires_at).toISOString()
  };
}

export function authorizationRequestPayload(input: AuthorizationRequestInput): Record<string, unknown> {
  return {
    domain: "accordtrace.gateway.authorization.request.v1",
    request_id: input.request_id,
    lease_id: input.lease_id,
    subject_passport_id: input.subject_passport_id,
    action: normalizeAction(input.action),
    target_origin: normalizeOrigin(input.target_origin),
    observed_at: input.observed_at
  };
}

export function revokeLeasePayload(input: RevokeLeaseInput): Record<string, unknown> {
  return {
    domain: "accordtrace.gateway.capability.revoke.v1",
    lease_id: input.lease_id,
    issuer_passport_id: input.issuer_passport_id,
    reason: (input.reason ?? "issuer_revoked").trim().slice(0, 200),
    revoked_at: input.revoked_at
  };
}

export function leaseStatusPayload(input: LeaseStatusInput): Record<string, unknown> {
  return {
    domain: "accordtrace.gateway.capability.status.v1",
    lease_id: input.lease_id,
    passport_id: input.passport_id,
    checked_at: input.checked_at
  };
}

function normalizeAction(value: string): string {
  const result = value.trim().toLowerCase();
  if (!/^[a-z0-9][a-z0-9:._/-]{0,99}$/.test(result)) throw new TypeError("Invalid capability action");
  return result;
}

function normalizeOrigin(value: string): string {
  const url = new URL(value);
  if (url.protocol !== "https:" || url.username || url.password) throw new TypeError("Capability origins must be HTTPS origins");
  return url.origin;
}

export class AgentGatewayClient {
  private readonly baseUrl: string;

  constructor(baseUrl: string) {
    this.baseUrl = baseUrl.replace(/\/$/, "");
  }

  async capabilities(): Promise<Record<string, unknown>> {
    return this.request("/api/v1/gateway/capabilities");
  }

  async createLease(input: CapabilityLeaseInput & { signature: string }): Promise<Record<string, unknown>> {
    return this.request("/api/v1/gateway/leases", input);
  }

  async authorize(input: AuthorizationRequestInput & { signature: string }): Promise<Record<string, unknown>> {
    return this.request("/api/v1/gateway/authorize", input);
  }

  async revoke(input: RevokeLeaseInput & { signature: string }): Promise<Record<string, unknown>> {
    return this.request("/api/v1/gateway/leases/revoke", input);
  }

  async status(input: LeaseStatusInput & { signature: string }): Promise<Record<string, unknown>> {
    return this.request("/api/v1/gateway/leases/status", input);
  }

  private async request(path: string, body?: unknown): Promise<Record<string, unknown>> {
    const response = await fetch(`${this.baseUrl}${path}`, body === undefined ? undefined : {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body)
    });
    const result = await response.json() as Record<string, unknown> & { message?: string };
    if (!response.ok) throw new Error(result.message ?? `AccordTrace gateway request failed (${response.status})`);
    return result;
  }
}
