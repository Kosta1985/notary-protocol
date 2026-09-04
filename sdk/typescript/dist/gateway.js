export function capabilityLeasePayload(input) {
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

export function authorizationRequestPayload(input) {
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

export function revokeLeasePayload(input) {
  return {
    domain: "accordtrace.gateway.capability.revoke.v1",
    lease_id: input.lease_id,
    issuer_passport_id: input.issuer_passport_id,
    reason: (input.reason ?? "issuer_revoked").trim().slice(0, 200),
    revoked_at: input.revoked_at
  };
}

export function leaseStatusPayload(input) {
  return {
    domain: "accordtrace.gateway.capability.status.v1",
    lease_id: input.lease_id,
    passport_id: input.passport_id,
    checked_at: input.checked_at
  };
}

function normalizeAction(value) {
  const result = value.trim().toLowerCase();
  if (!/^[a-z0-9][a-z0-9:._/-]{0,99}$/.test(result)) throw new TypeError("Invalid capability action");
  return result;
}

function normalizeOrigin(value) {
  const url = new URL(value);
  if (url.protocol !== "https:" || url.username || url.password) throw new TypeError("Capability origins must be HTTPS origins");
  return url.origin;
}

export class AgentGatewayClient {
  constructor(baseUrl) {
    this.baseUrl = baseUrl.replace(/\/$/, "");
  }
  async capabilities() { return this.request("/api/v1/gateway/capabilities"); }
  async createLease(input) { return this.request("/api/v1/gateway/leases", input); }
  async authorize(input) { return this.request("/api/v1/gateway/authorize", input); }
  async revoke(input) { return this.request("/api/v1/gateway/leases/revoke", input); }
  async status(input) { return this.request("/api/v1/gateway/leases/status", input); }
  async request(path, body) {
    const response = await fetch(`${this.baseUrl}${path}`, body === undefined ? undefined : {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body)
    });
    const result = await response.json();
    if (!response.ok) throw new Error(result.message ?? `AccordTrace gateway request failed (${response.status})`);
    return result;
  }
}
