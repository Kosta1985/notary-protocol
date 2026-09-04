const JSON_HEADERS = { "content-type": "application/json; charset=utf-8" };
const MAX_BODY_BYTES = 16_384;
const MAX_CLOCK_SKEW_MS = 10 * 60 * 1000;
const MAX_LEASE_MS = 30 * 24 * 60 * 60 * 1000;
let schemaReady = false;

export async function handleGateway(request, env, url = new URL(request.url)) {
  if (!url.pathname.startsWith("/api/v1/gateway/")) return null;
  await ensureGatewaySchema(env);

  if (request.method === "GET" && url.pathname === "/api/v1/gateway/capabilities") {
    return reply({
      service: "AccordTrace Capability Gateway",
      version: "0.1.0",
      features: ["signed_capability_leases", "least_privilege_actions", "origin_allowlists", "atomic_call_quota", "signed_authorization_requests", "issuer_kill_switch", "usage_decisions"],
      enforcement: "AccordTrace returns authorization decisions. The calling runtime, proxy, MCP host, API gateway, or other infrastructure owner must enforce the decision before executing the requested action.",
      safety: "Leases grant no access by themselves and contain no credentials. AccordTrace never asks an agent to disclose API keys, wallet secrets, passwords, or private keys."
    });
  }

  if (request.method === "POST" && url.pathname === "/api/v1/gateway/leases") {
    const body = await bodyJson(request);
    const leaseId = requireCleanId(body.lease_id, "lease_id");
    const issuer = await requirePassport(env, body.issuer_passport_id);
    const subject = await requirePassport(env, body.subject_passport_id);
    if (issuer.id === subject.id) throw new GatewayError("issuer and subject must use different Passports", 400);
    required(body.issued_at, "issued_at");
    required(body.expires_at, "expires_at");
    required(body.signature, "signature");
    assertFresh(body.issued_at);
    const expiresAt = assertLeaseExpiry(body.expires_at, body.issued_at);
    const maxCalls = boundedInt(body.max_calls, 1, 1_000_000, "max_calls");
    const allowedActions = normalizeActions(body.allowed_actions);
    const allowedOrigins = normalizeOrigins(body.allowed_origins);
    if (!allowedActions.length) throw new GatewayError("allowed_actions must contain at least one action", 400);
    if (!allowedOrigins.length) throw new GatewayError("allowed_origins must contain at least one HTTPS origin", 400);

    const payload = {
      domain: "accordtrace.gateway.capability.lease.v1",
      lease_id: leaseId,
      issuer_passport_id: issuer.id,
      subject_passport_id: subject.id,
      allowed_actions: allowedActions,
      allowed_origins: allowedOrigins,
      max_calls: maxCalls,
      issued_at: body.issued_at,
      expires_at: expiresAt
    };
    await verifyEd25519(issuer.public_key, canonicalize(payload), body.signature);

    const now = new Date().toISOString();
    const result = await env.DB.prepare(`INSERT OR IGNORE INTO capability_leases
      (id,issuer_passport_id,subject_passport_id,allowed_actions_json,allowed_origins_json,max_calls,used_calls,status,issued_at,expires_at,signature,created_at,updated_at)
      VALUES (?1,?2,?3,?4,?5,?6,0,'active',?7,?8,?9,?10,?10)`)
      .bind(leaseId, issuer.id, subject.id, JSON.stringify(allowedActions), JSON.stringify(allowedOrigins), maxCalls, body.issued_at, expiresAt, text(body.signature, 1000), now).run();
    if ((result.meta?.changes ?? 1) === 0) return reply({ error: "lease_already_exists" }, 409);

    return reply({ lease: leaseView(await getLease(env, leaseId)) }, 201);
  }

  if (request.method === "POST" && url.pathname === "/api/v1/gateway/authorize") {
    const body = await bodyJson(request);
    const requestId = requireCleanId(body.request_id, "request_id");
    const leaseId = requireCleanId(body.lease_id, "lease_id");
    const subject = await requirePassport(env, body.subject_passport_id);
    const action = normalizeAction(body.action);
    const targetOrigin = normalizeOrigin(body.target_origin);
    required(body.observed_at, "observed_at");
    required(body.signature, "signature");
    assertFresh(body.observed_at);

    const payload = {
      domain: "accordtrace.gateway.authorization.request.v1",
      request_id: requestId,
      lease_id: leaseId,
      subject_passport_id: subject.id,
      action,
      target_origin: targetOrigin,
      observed_at: body.observed_at
    };
    await verifyEd25519(subject.public_key, canonicalize(payload), body.signature);
    const requestDigest = await sha256(canonicalize(payload));

    const existing = await env.DB.prepare("SELECT request_digest,status,decision_id FROM gateway_requests WHERE id=?1").bind(requestId).first();
    if (existing) {
      if (existing.request_digest !== requestDigest) return reply({ error: "request_id_conflict" }, 409);
      if (existing.status === "decided" && existing.decision_id) {
        const decision = await getDecision(env, existing.decision_id);
        return reply({ decision, replayed: true });
      }
      return reply({ error: "authorization_request_in_progress" }, 409);
    }

    const now = new Date().toISOString();
    const reserved = await env.DB.prepare(`INSERT OR IGNORE INTO gateway_requests
      (id,request_digest,lease_id,subject_passport_id,action,target_origin,observed_at,status,created_at)
      VALUES (?1,?2,?3,?4,?5,?6,?7,'pending',?8)`)
      .bind(requestId, requestDigest, leaseId, subject.id, action, targetOrigin, body.observed_at, now).run();
    if ((reserved.meta?.changes ?? 1) === 0) return reply({ error: "authorization_request_conflict" }, 409);

    const lease = await getLease(env, leaseId);
    let allowed = false;
    let reason = "lease_not_found";
    let remainingCalls = 0;

    if (lease && lease.subject_passport_id === subject.id) {
      const actions = parseArray(lease.allowed_actions_json);
      const origins = parseArray(lease.allowed_origins_json);
      if (lease.status !== "active") reason = "lease_not_active";
      else if (Date.parse(lease.expires_at) <= Date.now()) reason = "lease_expired";
      else if (!actions.includes(action)) reason = "action_not_allowed";
      else if (!origins.includes(targetOrigin)) reason = "origin_not_allowed";
      else {
        const update = await env.DB.prepare(`UPDATE capability_leases
          SET used_calls=used_calls+1,updated_at=?1
          WHERE id=?2 AND subject_passport_id=?3 AND status='active' AND expires_at>?1 AND used_calls<max_calls`)
          .bind(now, leaseId, subject.id).run();
        if ((update.meta?.changes ?? 0) === 1) {
          allowed = true;
          reason = "authorized";
          const after = await getLease(env, leaseId);
          remainingCalls = Math.max(0, Number(after.max_calls) - Number(after.used_calls));
        } else {
          const after = await getLease(env, leaseId);
          reason = after?.status !== "active" ? "lease_not_active" : Date.parse(after?.expires_at ?? 0) <= Date.now() ? "lease_expired" : "quota_exhausted";
          remainingCalls = Math.max(0, Number(after?.max_calls ?? 0) - Number(after?.used_calls ?? 0));
        }
      }
    } else if (lease) {
      reason = "subject_mismatch";
    }

    const decision = {
      id: `gwd_${crypto.randomUUID()}`,
      request_id: requestId,
      lease_id: leaseId,
      subject_passport_id: subject.id,
      action,
      target_origin: targetOrigin,
      allowed,
      reason,
      remaining_calls: remainingCalls,
      decided_at: now
    };
    await env.DB.batch([
      env.DB.prepare(`INSERT INTO gateway_decisions
        (id,request_id,lease_id,subject_passport_id,action,target_origin,allowed,reason,remaining_calls,decided_at,created_at)
        VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9,?10,?10)`)
        .bind(decision.id, requestId, leaseId, subject.id, action, targetOrigin, allowed ? 1 : 0, reason, remainingCalls, now),
      env.DB.prepare("UPDATE gateway_requests SET status='decided',decision_id=?1 WHERE id=?2 AND status='pending'").bind(decision.id, requestId)
    ]);
    return reply({ decision });
  }

  if (request.method === "POST" && url.pathname === "/api/v1/gateway/leases/revoke") {
    const body = await bodyJson(request);
    const leaseId = requireCleanId(body.lease_id, "lease_id");
    const lease = await getLease(env, leaseId);
    if (!lease) return reply({ error: "lease_not_found" }, 404);
    const issuer = await requirePassport(env, body.issuer_passport_id);
    if (lease.issuer_passport_id !== issuer.id) return reply({ error: "issuer_mismatch" }, 403);
    required(body.revoked_at, "revoked_at");
    required(body.signature, "signature");
    assertFresh(body.revoked_at);
    const reason = nullable(body.reason, 200) || "issuer_revoked";
    const payload = {
      domain: "accordtrace.gateway.capability.revoke.v1",
      lease_id: leaseId,
      issuer_passport_id: issuer.id,
      reason,
      revoked_at: body.revoked_at
    };
    await verifyEd25519(issuer.public_key, canonicalize(payload), body.signature);
    const result = await env.DB.prepare(`UPDATE capability_leases
      SET status='revoked',revoked_at=?1,revoke_reason=?2,updated_at=?3
      WHERE id=?4 AND status='active'`)
      .bind(body.revoked_at, reason, new Date().toISOString(), leaseId).run();
    if ((result.meta?.changes ?? 0) !== 1) return reply({ error: "lease_not_active" }, 409);
    return reply({ lease: leaseView(await getLease(env, leaseId)), kill_switch: "revoked" });
  }

  if (request.method === "POST" && url.pathname === "/api/v1/gateway/leases/status") {
    const body = await bodyJson(request);
    const leaseId = requireCleanId(body.lease_id, "lease_id");
    const passport = await requirePassport(env, body.passport_id);
    required(body.checked_at, "checked_at");
    required(body.signature, "signature");
    assertFresh(body.checked_at);
    const lease = await getLease(env, leaseId);
    if (!lease) return reply({ error: "lease_not_found" }, 404);
    if (![lease.issuer_passport_id, lease.subject_passport_id].includes(passport.id)) return reply({ error: "passport_not_party_to_lease" }, 403);
    const payload = {
      domain: "accordtrace.gateway.capability.status.v1",
      lease_id: leaseId,
      passport_id: passport.id,
      checked_at: body.checked_at
    };
    await verifyEd25519(passport.public_key, canonicalize(payload), body.signature);
    return reply({ lease: leaseView(lease) });
  }

  return reply({ error: "not_found" }, 404);
}

async function requirePassport(env, id) {
  required(id, "passport_id");
  const passport = await env.DB.prepare("SELECT id,public_key,status FROM agent_passports WHERE id=?1").bind(id).first();
  if (!passport) throw new GatewayError("passport_not_found", 404);
  if (passport.status !== "active") throw new GatewayError("passport_not_active", 403);
  return passport;
}

async function getLease(env, id) {
  return env.DB.prepare("SELECT * FROM capability_leases WHERE id=?1").bind(id).first();
}
async function getDecision(env, id) {
  const row = await env.DB.prepare("SELECT id,request_id,lease_id,subject_passport_id,action,target_origin,allowed,reason,remaining_calls,decided_at FROM gateway_decisions WHERE id=?1").bind(id).first();
  return row ? { ...row, allowed: Boolean(row.allowed) } : null;
}
function leaseView(row) {
  if (!row) return null;
  return {
    id: row.id,
    issuer_passport_id: row.issuer_passport_id,
    subject_passport_id: row.subject_passport_id,
    allowed_actions: parseArray(row.allowed_actions_json),
    allowed_origins: parseArray(row.allowed_origins_json),
    max_calls: Number(row.max_calls),
    used_calls: Number(row.used_calls),
    remaining_calls: Math.max(0, Number(row.max_calls) - Number(row.used_calls)),
    status: row.status,
    issued_at: row.issued_at,
    expires_at: row.expires_at,
    revoked_at: row.revoked_at,
    revoke_reason: row.revoke_reason,
    created_at: row.created_at,
    updated_at: row.updated_at
  };
}

async function ensureGatewaySchema(env) {
  if (schemaReady) return;
  const statements = [
    `CREATE TABLE IF NOT EXISTS capability_leases (
      id TEXT PRIMARY KEY, issuer_passport_id TEXT NOT NULL, subject_passport_id TEXT NOT NULL,
      allowed_actions_json TEXT NOT NULL, allowed_origins_json TEXT NOT NULL, max_calls INTEGER NOT NULL,
      used_calls INTEGER NOT NULL DEFAULT 0, status TEXT NOT NULL DEFAULT 'active', issued_at TEXT NOT NULL,
      expires_at TEXT NOT NULL, signature TEXT NOT NULL, revoked_at TEXT, revoke_reason TEXT,
      created_at TEXT NOT NULL, updated_at TEXT NOT NULL
    )`,
    `CREATE INDEX IF NOT EXISTS idx_capability_leases_subject ON capability_leases(subject_passport_id, status, expires_at)`,
    `CREATE TABLE IF NOT EXISTS gateway_requests (
      id TEXT PRIMARY KEY, request_digest TEXT NOT NULL, lease_id TEXT NOT NULL, subject_passport_id TEXT NOT NULL,
      action TEXT NOT NULL, target_origin TEXT NOT NULL, observed_at TEXT NOT NULL, status TEXT NOT NULL,
      decision_id TEXT, created_at TEXT NOT NULL
    )`,
    `CREATE TABLE IF NOT EXISTS gateway_decisions (
      id TEXT PRIMARY KEY, request_id TEXT NOT NULL UNIQUE, lease_id TEXT NOT NULL, subject_passport_id TEXT NOT NULL,
      action TEXT NOT NULL, target_origin TEXT NOT NULL, allowed INTEGER NOT NULL, reason TEXT NOT NULL,
      remaining_calls INTEGER NOT NULL, decided_at TEXT NOT NULL, created_at TEXT NOT NULL
    )`,
    `CREATE INDEX IF NOT EXISTS idx_gateway_decisions_lease ON gateway_decisions(lease_id, created_at DESC)`
  ];
  if (typeof env.DB.batch === "function") await env.DB.batch(statements.map((sql) => env.DB.prepare(sql)));
  else for (const sql of statements) await env.DB.prepare(sql).run();
  schemaReady = true;
}

function normalizeActions(value) {
  if (!Array.isArray(value)) return [];
  const actions = value.slice(0, 50).map(normalizeAction);
  return [...new Set(actions)].sort();
}
function normalizeAction(value) {
  const result = String(value ?? "").trim().toLowerCase();
  if (!/^[a-z0-9][a-z0-9:._/-]{0,99}$/.test(result)) throw new GatewayError("action format is invalid", 400);
  return result;
}
function normalizeOrigins(value) {
  if (!Array.isArray(value)) return [];
  return [...new Set(value.slice(0, 50).map(normalizeOrigin))].sort();
}
function normalizeOrigin(value) {
  try {
    const url = new URL(String(value ?? ""));
    if (url.protocol !== "https:") throw new Error();
    if (url.username || url.password) throw new Error();
    return url.origin;
  } catch {
    throw new GatewayError("origins must be valid HTTPS origins", 400);
  }
}
function assertLeaseExpiry(expiresAt, issuedAt) {
  const expiry = Date.parse(expiresAt);
  const issued = Date.parse(issuedAt);
  if (!Number.isFinite(expiry) || !Number.isFinite(issued)) throw new GatewayError("lease timestamps must be ISO-8601", 400);
  if (expiry <= issued) throw new GatewayError("expires_at must be after issued_at", 400);
  if (expiry <= Date.now()) throw new GatewayError("lease must expire in the future", 400);
  if (expiry - issued > MAX_LEASE_MS) throw new GatewayError("lease duration cannot exceed 30 days", 400);
  return new Date(expiry).toISOString();
}
function assertFresh(value) {
  const time = Date.parse(value);
  if (!Number.isFinite(time)) throw new GatewayError("timestamp must be ISO-8601", 400);
  if (Math.abs(Date.now() - time) > MAX_CLOCK_SKEW_MS) throw new GatewayError("signed timestamp is outside the allowed window", 400);
}
function boundedInt(value, min, max, name) {
  const number = Number(value);
  if (!Number.isInteger(number) || number < min || number > max) throw new GatewayError(`${name} must be an integer between ${min} and ${max}`, 400);
  return number;
}
async function verifyEd25519(publicKeyPem, message, signature) {
  let key;
  try { key = await crypto.subtle.importKey("spki", pemBytes(publicKeyPem), { name: "Ed25519" }, false, ["verify"]); }
  catch { throw new GatewayError("passport public key is invalid", 422); }
  let signatureBytes;
  try { signatureBytes = fromBase64url(signature); }
  catch { throw new GatewayError("signature must be base64url", 400); }
  const valid = await crypto.subtle.verify("Ed25519", key, signatureBytes, new TextEncoder().encode(message));
  if (!valid) throw new GatewayError("signature verification failed", 401);
}
function pemBytes(pem) {
  const match = String(pem).match(/-----BEGIN PUBLIC KEY-----([\s\S]+?)-----END PUBLIC KEY-----/);
  if (!match) throw new GatewayError("passport public key must be SPKI PEM", 422);
  const binary = atob(match[1].replace(/\s+/g, ""));
  return Uint8Array.from(binary, (char) => char.charCodeAt(0));
}
function fromBase64url(value) {
  const normalized = String(value).replace(/-/g, "+").replace(/_/g, "/");
  const padded = normalized + "=".repeat((4 - normalized.length % 4) % 4);
  const binary = atob(padded);
  return Uint8Array.from(binary, (char) => char.charCodeAt(0));
}
function canonicalize(value) {
  if (value === null || typeof value === "boolean") return JSON.stringify(value);
  if (typeof value === "number") { if (!Number.isFinite(value)) throw new GatewayError("non-finite number", 400); return JSON.stringify(Object.is(value, -0) ? 0 : value); }
  if (typeof value === "string") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonicalize).join(",")}]`;
  if (typeof value === "object") return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonicalize(value[key])}`).join(",")}}`;
  throw new GatewayError("unsupported signed payload value", 400);
}
async function sha256(value) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}
function parseArray(value){try{return JSON.parse(value||"[]")}catch{return[]}}
function text(value,max){return String(value??"").trim().slice(0,max)}
function nullable(value,max){const result=text(value,max);return result||null}
function required(value,name){if(!text(value,1))throw new GatewayError(`${name} is required`,400)}
function cleanId(value){const result=text(value,200);return /^[A-Za-z0-9:_\-.]{3,200}$/.test(result)?result:null}
function requireCleanId(value,name){required(value,name);const result=cleanId(value);if(!result)throw new GatewayError(`${name} format is invalid`,400);return result}
async function bodyJson(request){const raw=await request.text();if(new TextEncoder().encode(raw).byteLength>MAX_BODY_BYTES)throw new GatewayError("request body exceeds 16 KiB",413);try{return JSON.parse(raw)}catch{throw new GatewayError("request body must be JSON",400)}}
function reply(body,status=200){return new Response(JSON.stringify(body),{status,headers:JSON_HEADERS})}
export class GatewayError extends Error{constructor(message,status=400){super(message);this.status=status}}
