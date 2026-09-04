import { authorizationRequestPayload, leaseStatusPayload } from "./gateway.js";

export interface EnforcementSigner {
  passportId: string;
  sign(payload: Record<string, unknown>): Promise<string>;
}

export interface EnforcementHooks {
  onDecision?(event: EnforcementDecisionEvent): Promise<void> | void;
  onExecuted?(event: EnforcementExecutionEvent): Promise<void> | void;
  onError?(event: EnforcementErrorEvent): Promise<void> | void;
}

export interface EnforcementDecisionEvent {
  kind: "http" | "mcp";
  action: string;
  target_origin: string;
  lease_id: string;
  allowed: boolean;
  reason: string;
  request_id: string;
}

export interface EnforcementExecutionEvent {
  kind: "http" | "mcp";
  action: string;
  target_origin: string;
  lease_id: string;
  request_id: string;
  outcome: "executed";
}

export interface EnforcementErrorEvent {
  kind: "http" | "mcp";
  action: string;
  target_origin: string;
  lease_id: string;
  request_id: string;
  code: string;
}

export interface CredentialBrokerContext {
  action: string;
  target_origin: string;
  lease_id: string;
  request_id: string;
}

export interface EnforcementOptions {
  accordTraceBaseUrl: string;
  leaseId: string;
  signer: EnforcementSigner;
  fetchImpl?: typeof fetch;
  credentialBroker?: (context: CredentialBrokerContext) => Promise<Record<string, string>> | Record<string, string>;
  hooks?: EnforcementHooks;
  maxDecisionAgeMs?: number;
  failMode?: "closed" | "open";
}

const SENSITIVE_HEADERS = new Set([
  "authorization",
  "proxy-authorization",
  "cookie",
  "x-api-key",
  "x-auth-token"
]);

export function createProtectedFetch(options: EnforcementOptions): typeof fetch {
  const fetchImpl = options.fetchImpl ?? fetch;
  const maxDecisionAgeMs = clampDecisionAge(options.maxDecisionAgeMs);
  const failMode = options.failMode ?? "closed";

  return async function protectedFetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
    const request = new Request(input, init);
    if (request.url.startsWith(options.accordTraceBaseUrl.replace(/\/$/, "") + "/")) {
      throw new EnforcementError("recursive_accordtrace_request", "Protected fetch must not proxy AccordTrace itself");
    }
    const target = new URL(request.url);
    if (target.protocol !== "https:") throw new EnforcementError("https_required", "Protected requests must use HTTPS");
    rejectSensitiveAgentHeaders(request.headers);
    const action = httpAction(request.method, target);
    const targetOrigin = target.origin;
    const requestId = randomId("enf");

    let decision;
    try {
      decision = await authorizeFresh(options, { kind: "http", action, targetOrigin, requestId, fetchImpl, maxDecisionAgeMs });
    } catch (error) {
      await safeHook(options.hooks?.onError, { kind: "http", action, target_origin: targetOrigin, lease_id: options.leaseId, request_id: requestId, code: errorCode(error) });
      if (failMode === "open" && !options.credentialBroker) return fetchImpl(request);
      throw error;
    }
    if (!decision.allowed) throw new EnforcementError("authorization_denied", `AccordTrace denied request: ${decision.reason}`);

    await assertLeaseStillActive(options, fetchImpl);
    const brokered = options.credentialBroker ? await options.credentialBroker({ action, target_origin: targetOrigin, lease_id: options.leaseId, request_id: requestId }) : {};
    const headers = new Headers(request.headers);
    for (const [name, value] of Object.entries(brokered)) {
      if (!isSensitiveHeader(name)) throw new EnforcementError("broker_header_not_sensitive", "Credential broker may inject only sensitive credential headers");
      headers.set(name, value);
    }
    const response = await fetchImpl(new Request(request, { headers }));
    await safeHook(options.hooks?.onExecuted, { kind: "http", action, target_origin: targetOrigin, lease_id: options.leaseId, request_id: requestId, outcome: "executed" });
    return response;
  } as typeof fetch;
}

export interface ProtectedMcpOptions extends EnforcementOptions {
  serverId: string;
  serverOrigin: string;
}

export function createProtectedMcpCallTool<TArgs, TResult>(
  options: ProtectedMcpOptions,
  callTool: (name: string, args: TArgs) => Promise<TResult>
): (name: string, args: TArgs) => Promise<TResult> {
  const fetchImpl = options.fetchImpl ?? fetch;
  const maxDecisionAgeMs = clampDecisionAge(options.maxDecisionAgeMs);
  const serverOrigin = normalizeHttpsOrigin(options.serverOrigin);
  const serverId = normalizeSegment(options.serverId);

  return async (name: string, args: TArgs): Promise<TResult> => {
    const tool = normalizeSegment(name);
    const action = `mcp:${serverId}:${tool}`;
    const requestId = randomId("mcp");
    let decision;
    try {
      decision = await authorizeFresh(options, { kind: "mcp", action, targetOrigin: serverOrigin, requestId, fetchImpl, maxDecisionAgeMs });
    } catch (error) {
      await safeHook(options.hooks?.onError, { kind: "mcp", action, target_origin: serverOrigin, lease_id: options.leaseId, request_id: requestId, code: errorCode(error) });
      if (options.failMode === "open" && !options.credentialBroker) return callTool(name, args);
      throw error;
    }
    if (!decision.allowed) throw new EnforcementError("authorization_denied", `AccordTrace denied MCP tool call: ${decision.reason}`);
    await assertLeaseStillActive(options, fetchImpl);
    const result = await callTool(name, args);
    await safeHook(options.hooks?.onExecuted, { kind: "mcp", action, target_origin: serverOrigin, lease_id: options.leaseId, request_id: requestId, outcome: "executed" });
    return result;
  };
}

async function authorizeFresh(options: EnforcementOptions, context: { kind: "http" | "mcp"; action: string; targetOrigin: string; requestId: string; fetchImpl: typeof fetch; maxDecisionAgeMs: number }) {
  const observedAt = new Date().toISOString();
  const payload = authorizationRequestPayload({
    request_id: context.requestId,
    lease_id: options.leaseId,
    subject_passport_id: options.signer.passportId,
    action: context.action,
    target_origin: context.targetOrigin,
    observed_at: observedAt
  });
  const signature = await options.signer.sign(payload);
  const response = await context.fetchImpl(`${options.accordTraceBaseUrl.replace(/\/$/, "")}/api/v1/gateway/authorize`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ ...payloadWithoutDomain(payload), signature })
  });
  const result = await parseJson(response);
  if (!response.ok) throw new EnforcementError("gateway_unavailable", result.message ?? `Gateway request failed (${response.status})`);
  const decision = result.decision as Record<string, unknown> | undefined;
  if (!decision || typeof decision.allowed !== "boolean" || typeof decision.decided_at !== "string") throw new EnforcementError("invalid_gateway_decision", "Gateway returned an invalid decision");
  const age = Date.now() - Date.parse(decision.decided_at);
  if (!Number.isFinite(age) || age < -5_000 || age > context.maxDecisionAgeMs) throw new EnforcementError("stale_gateway_decision", "Gateway decision is too old or invalid");
  const event = { kind: context.kind, action: context.action, target_origin: context.targetOrigin, lease_id: options.leaseId, allowed: decision.allowed, reason: String(decision.reason ?? "unknown"), request_id: context.requestId } satisfies EnforcementDecisionEvent;
  await safeHook(options.hooks?.onDecision, event);
  return { allowed: decision.allowed, reason: String(decision.reason ?? "unknown") };
}

async function assertLeaseStillActive(options: EnforcementOptions, fetchImpl: typeof fetch): Promise<void> {
  const checkedAt = new Date().toISOString();
  const payload = leaseStatusPayload({ lease_id: options.leaseId, passport_id: options.signer.passportId, checked_at: checkedAt });
  const signature = await options.signer.sign(payload);
  const response = await fetchImpl(`${options.accordTraceBaseUrl.replace(/\/$/, "")}/api/v1/gateway/leases/status`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ ...payloadWithoutDomain(payload), signature })
  });
  const result = await parseJson(response);
  if (!response.ok) throw new EnforcementError("lease_status_failed", result.message ?? `Lease status failed (${response.status})`);
  const lease = result.lease as Record<string, unknown> | undefined;
  if (!lease || lease.status !== "active") throw new EnforcementError("lease_not_active", "Lease was revoked or is inactive");
  const expiry = Date.parse(String(lease.expires_at ?? ""));
  if (!Number.isFinite(expiry) || expiry <= Date.now()) throw new EnforcementError("lease_expired", "Lease has expired");
}

function rejectSensitiveAgentHeaders(headers: Headers): void {
  for (const name of headers.keys()) if (isSensitiveHeader(name)) throw new EnforcementError("agent_supplied_credential", `Agent supplied protected credential header: ${name}`);
}
function isSensitiveHeader(name: string): boolean { return SENSITIVE_HEADERS.has(name.toLowerCase()); }
function httpAction(method: string, url: URL): string {
  const resource = url.pathname.split("/").filter(Boolean).slice(0, 2).map(normalizeSegment).join(":") || "root";
  return `http:${method.toLowerCase()}:${normalizeSegment(url.hostname)}:${resource}`;
}
function normalizeSegment(value: string): string {
  const out = value.trim().toLowerCase().replace(/[^a-z0-9._-]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 60);
  if (!out) throw new EnforcementError("invalid_identifier", "Identifier cannot be normalized safely");
  return out;
}
function normalizeHttpsOrigin(value: string): string {
  const url = new URL(value);
  if (url.protocol !== "https:" || url.username || url.password) throw new EnforcementError("https_required", "MCP server origin must be HTTPS");
  return url.origin;
}
function payloadWithoutDomain(payload: Record<string, unknown>): Record<string, unknown> { const { domain: _domain, ...rest } = payload; return rest; }
function randomId(prefix: string): string { return `${prefix}_${crypto.randomUUID()}`; }
function clampDecisionAge(value?: number): number { return Math.max(250, Math.min(10_000, Math.round(value ?? 2_000))); }
function errorCode(error: unknown): string { return error instanceof EnforcementError ? error.code : "enforcement_error"; }
async function parseJson(response: Response): Promise<Record<string, any>> { try { return await response.json() as Record<string, any>; } catch { return {}; } }
async function safeHook<T>(hook: ((event: T) => Promise<void> | void) | undefined, event: T): Promise<void> { if (!hook) return; try { await hook(event); } catch {} }

export class EnforcementError extends Error {
  constructor(public readonly code: string, message: string) { super(message); }
}
