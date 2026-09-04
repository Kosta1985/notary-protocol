const JSON_HEADERS = { "content-type": "application/json; charset=utf-8" };
let schemaReady = false;

const EVENT_POLICY = {
  normal_action: { severity: 5, delta: 0 },
  verified_delivery: { severity: 10, delta: 3 },
  tool_scope_violation: { severity: 55, delta: -8 },
  network_policy_violation: { severity: 65, delta: -12 },
  secret_access_attempt: { severity: 80, delta: -18 },
  canary_touch: { severity: 90, delta: -20 },
  identity_mismatch: { severity: 90, delta: -25 },
  payment_anomaly: { severity: 70, delta: -15 },
  containment: { severity: 60, delta: -5 },
  recovery: { severity: 20, delta: 8 }
};

export async function handleSecurity(request, env, url = new URL(request.url)) {
  if (!url.pathname.startsWith("/api/v1/security/")) return null;
  await ensureSecuritySchema(env);

  if (request.method === "GET" && url.pathname === "/api/v1/security/capabilities") {
    return reply({
      service: "AccordTrace Agent Security & Trust",
      version: "0.1.0",
      features: ["agent_passport", "trust_score", "security_events", "containment_recommendations", "passive_canaries"],
      safety: "Canaries are passive signals only. AccordTrace does not exploit agents, access third-party systems, capture credentials, or transfer funds.",
      trust_model: "Only proof-backed events can change trust score. Unverified reports are recorded as signals with zero score impact."
    });
  }

  if (request.method === "POST" && url.pathname === "/api/v1/security/passports") {
    const body = await bodyJson(request);
    required(body.agent_id, "agent_id");
    const agent = await getMarketplaceAgent(env, body.agent_id);
    if (!agent) return reply({ error: "agent_not_found" }, 404);
    const now = new Date().toISOString();
    await env.DB.prepare(`INSERT INTO agent_passports
      (agent_id,identity_ref,payment_endpoint,payment_methods_json,status,created_at,updated_at)
      VALUES (?1,?2,?3,?4,'active',?5,?5)
      ON CONFLICT(agent_id) DO UPDATE SET
        identity_ref=excluded.identity_ref,
        payment_endpoint=excluded.payment_endpoint,
        payment_methods_json=excluded.payment_methods_json,
        updated_at=excluded.updated_at`)
      .bind(
        body.agent_id,
        safeUrl(body.identity_ref),
        safeUrl(body.payment_endpoint),
        jsonArray(body.payment_methods),
        now
      ).run();
    return reply({ passport: await buildPassport(env, body.agent_id) }, 201);
  }

  const passportMatch = url.pathname.match(/^\/api\/v1\/security\/passports\/([^/]+)$/);
  if (request.method === "GET" && passportMatch) {
    const agentId = decodeURIComponent(passportMatch[1]);
    const passport = await buildPassport(env, agentId);
    return passport ? reply({ passport }) : reply({ error: "passport_not_found" }, 404);
  }

  if (request.method === "POST" && url.pathname === "/api/v1/security/events") {
    const body = await bodyJson(request);
    required(body.agent_id, "agent_id");
    const type = enumValue(body.type, Object.keys(EVENT_POLICY), null);
    if (!type) throw new SecurityError("unsupported event type", 400);
    if (!await getMarketplaceAgent(env, body.agent_id)) return reply({ error: "agent_not_found" }, 404);
    await ensurePassport(env, body.agent_id);

    const policy = EVENT_POLICY[type];
    const severity = clampInt(body.severity ?? policy.severity, 0, 100);
    const evidenceDigest = nullable(body.evidence_digest, 256);
    const proofId = nullable(body.proof_id, 256);
    const verified = proofId ? await verifyProofBinding(env, proofId, evidenceDigest) : false;
    const trustDelta = verified ? policy.delta : 0;
    const recommendation = actionFor(type, severity);
    const eventId = `sec_${crypto.randomUUID()}`;
    const now = new Date().toISOString();

    await env.DB.prepare(`INSERT INTO security_events
      (id,agent_id,event_type,severity,verified,trust_delta,recommended_action,evidence_digest,proof_id,source,metadata_json,created_at)
      VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9,?10,?11,?12)`)
      .bind(
        eventId,
        body.agent_id,
        type,
        severity,
        verified ? 1 : 0,
        trustDelta,
        recommendation,
        evidenceDigest,
        proofId,
        nullable(body.source, 80) || "self-report",
        safeMetadata(body.metadata),
        now
      ).run();

    await env.DB.prepare("UPDATE agent_passports SET updated_at=?1,last_event_at=?1 WHERE agent_id=?2").bind(now, body.agent_id).run();
    const passport = await buildPassport(env, body.agent_id);
    return reply({
      event: { id: eventId, agent_id: body.agent_id, type, severity, verified, trust_delta: trustDelta, recommended_action: recommendation, created_at: now },
      passport,
      note: verified ? "Trust score updated from proof-backed evidence." : "Signal recorded; trust score unchanged until evidence is proof-backed."
    }, 201);
  }

  if (request.method === "POST" && url.pathname === "/api/v1/security/canaries") {
    const body = await bodyJson(request);
    required(body.label, "label");
    const agentId = nullable(body.agent_id, 200);
    if (agentId && !await getMarketplaceAgent(env, agentId)) return reply({ error: "agent_not_found" }, 404);
    const token = randomToken();
    const tokenHash = await sha256(token);
    const id = `cny_${crypto.randomUUID()}`;
    const now = new Date().toISOString();
    await env.DB.prepare(`INSERT INTO security_canaries
      (id,agent_id,label,token_hash,active,touch_count,created_at)
      VALUES (?1,?2,?3,?4,1,0,?5)`)
      .bind(id, agentId, text(body.label, 160), tokenHash, now).run();
    return reply({
      canary: {
        id,
        agent_id: agentId,
        label: text(body.label, 160),
        token,
        touch_url: `${url.origin}/api/v1/security/canaries/touch/${encodeURIComponent(token)}`,
        deploy_notice: "Deploy only in infrastructure you own or are authorized to test. The endpoint records no source IP and never captures credentials."
      }
    }, 201);
  }

  const touchMatch = url.pathname.match(/^\/api\/v1\/security\/canaries\/touch\/([^/]+)$/);
  if (touchMatch && (request.method === "GET" || request.method === "POST")) {
    const token = decodeURIComponent(touchMatch[1]);
    const tokenHash = await sha256(token);
    const canary = await env.DB.prepare("SELECT id,agent_id,label FROM security_canaries WHERE token_hash=?1 AND active=1").bind(tokenHash).first();
    if (!canary) return new Response(null, { status: 204 });
    const now = new Date().toISOString();
    await env.DB.prepare("UPDATE security_canaries SET touch_count=touch_count+1,last_touched_at=?1 WHERE id=?2").bind(now, canary.id).run();
    if (canary.agent_id) {
      await ensurePassport(env, canary.agent_id);
      await env.DB.prepare(`INSERT INTO security_events
        (id,agent_id,event_type,severity,verified,trust_delta,recommended_action,source,metadata_json,created_at)
        VALUES (?1,?2,'canary_touch',90,0,0,'isolate','passive-canary',?3,?4)`)
        .bind(`sec_${crypto.randomUUID()}`, canary.agent_id, JSON.stringify({ canary_id: canary.id, label: canary.label }), now).run();
      await env.DB.prepare("UPDATE agent_passports SET updated_at=?1,last_event_at=?1 WHERE agent_id=?2").bind(now, canary.agent_id).run();
    }
    return new Response(null, { status: 204 });
  }

  if (request.method === "POST" && url.pathname === "/api/v1/security/canaries/check") {
    const body = await bodyJson(request);
    required(body.token, "token");
    const tokenHash = await sha256(String(body.token));
    const canary = await env.DB.prepare("SELECT id,agent_id,label,active,touch_count,last_touched_at,created_at FROM security_canaries WHERE token_hash=?1").bind(tokenHash).first();
    return canary ? reply({ canary }) : reply({ error: "canary_not_found" }, 404);
  }

  return reply({ error: "not_found" }, 404);
}

async function buildPassport(env, agentId) {
  const row = await env.DB.prepare("SELECT * FROM agent_passports WHERE agent_id=?1").bind(agentId).first();
  if (!row) return null;
  const verifiedTasks = await env.DB.prepare("SELECT COUNT(*) AS count FROM marketplace_tasks WHERE provider_agent_id=?1 AND status='verified'").bind(agentId).first();
  const eventTotals = await env.DB.prepare("SELECT COALESCE(SUM(trust_delta),0) AS delta, SUM(CASE WHEN verified=1 THEN 1 ELSE 0 END) AS verified_count, COUNT(*) AS signal_count FROM security_events WHERE agent_id=?1").bind(agentId).first();
  const incidentTotals = await env.DB.prepare("SELECT COUNT(*) AS count FROM security_events WHERE agent_id=?1 AND event_type IN ('tool_scope_violation','network_policy_violation','secret_access_attempt','canary_touch','identity_mismatch','payment_anomaly')").bind(agentId).first();
  const taskBoost = Math.min(30, Number(verifiedTasks?.count ?? 0) * 3);
  const score = clampInt(50 + taskBoost + Number(eventTotals?.delta ?? 0), 0, 100);
  const level = trustLevel(score);
  return {
    agent_id: row.agent_id,
    identity_ref: row.identity_ref,
    payment_endpoint: row.payment_endpoint,
    payment_methods: parseArray(row.payment_methods_json),
    status: row.status,
    trust_score: score,
    trust_level: level,
    verified_marketplace_deliveries: Number(verifiedTasks?.count ?? 0),
    verified_security_events: Number(eventTotals?.verified_count ?? 0),
    security_signals: Number(eventTotals?.signal_count ?? 0),
    incident_signals: Number(incidentTotals?.count ?? 0),
    last_event_at: row.last_event_at,
    created_at: row.created_at,
    updated_at: row.updated_at,
    score_explanation: "Base 50 + up to 30 points from verified marketplace deliveries + proof-backed security event deltas. Unverified reports never change score."
  };
}

async function ensurePassport(env, agentId) {
  const existing = await env.DB.prepare("SELECT agent_id FROM agent_passports WHERE agent_id=?1").bind(agentId).first();
  if (existing) return;
  const now = new Date().toISOString();
  await env.DB.prepare("INSERT INTO agent_passports (agent_id,status,payment_methods_json,created_at,updated_at) VALUES (?1,'active','[]',?2,?2)").bind(agentId, now).run();
}

async function verifyProofBinding(env, proofId, evidenceDigest) {
  if (!evidenceDigest) throw new SecurityError("evidence_digest is required when proof_id is supplied", 400);
  const row = await env.DB.prepare("SELECT receipt FROM receipts WHERE id=?1").bind(proofId).first();
  if (!row) throw new SecurityError("proof_not_found", 422);
  let receipt;
  try { receipt = JSON.parse(row.receipt); } catch { throw new SecurityError("proof_invalid", 422); }
  if (!receipt.valid || receipt.evidenceDigest !== evidenceDigest) throw new SecurityError("proof_evidence_mismatch", 422);
  return true;
}

async function getMarketplaceAgent(env, id) {
  return env.DB.prepare("SELECT id,name FROM marketplace_agents WHERE id=?1").bind(id).first();
}

async function ensureSecuritySchema(env) {
  if (schemaReady) return;
  const statements = [
    `CREATE TABLE IF NOT EXISTS agent_passports (
      agent_id TEXT PRIMARY KEY,
      identity_ref TEXT,
      payment_endpoint TEXT,
      payment_methods_json TEXT NOT NULL DEFAULT '[]',
      status TEXT NOT NULL DEFAULT 'active',
      last_event_at TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    )`,
    `CREATE TABLE IF NOT EXISTS security_events (
      id TEXT PRIMARY KEY,
      agent_id TEXT NOT NULL,
      event_type TEXT NOT NULL,
      severity INTEGER NOT NULL,
      verified INTEGER NOT NULL DEFAULT 0,
      trust_delta INTEGER NOT NULL DEFAULT 0,
      recommended_action TEXT NOT NULL,
      evidence_digest TEXT,
      proof_id TEXT,
      source TEXT NOT NULL DEFAULT 'self-report',
      metadata_json TEXT NOT NULL DEFAULT '{}',
      created_at TEXT NOT NULL
    )`,
    `CREATE INDEX IF NOT EXISTS idx_security_events_agent_created ON security_events(agent_id, created_at DESC)`,
    `CREATE TABLE IF NOT EXISTS security_canaries (
      id TEXT PRIMARY KEY,
      agent_id TEXT,
      label TEXT NOT NULL,
      token_hash TEXT NOT NULL UNIQUE,
      active INTEGER NOT NULL DEFAULT 1,
      touch_count INTEGER NOT NULL DEFAULT 0,
      last_touched_at TEXT,
      created_at TEXT NOT NULL
    )`,
    `CREATE INDEX IF NOT EXISTS idx_security_canaries_agent ON security_canaries(agent_id, created_at DESC)`
  ];
  if (typeof env.DB.batch === "function") {
    await env.DB.batch(statements.map((sql) => env.DB.prepare(sql)));
  } else {
    for (const sql of statements) await env.DB.prepare(sql).run();
  }
  schemaReady = true;
}

function actionFor(type, severity) {
  if (type === "canary_touch" || type === "identity_mismatch" || severity >= 90) return "isolate";
  if (severity >= 70) return "restrict";
  if (severity >= 50) return "challenge";
  return "observe";
}
function trustLevel(score) {
  if (score >= 80) return "trusted";
  if (score >= 60) return "verified";
  if (score >= 40) return "observed";
  if (score >= 20) return "restricted";
  return "quarantined";
}
function safeMetadata(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return "{}";
  const allowed = {};
  for (const [key, item] of Object.entries(value).slice(0, 20)) {
    if (!/^[A-Za-z0-9_.-]{1,60}$/.test(key)) continue;
    if (["string","number","boolean"].includes(typeof item)) allowed[key] = typeof item === "string" ? item.slice(0, 300) : item;
  }
  return JSON.stringify(allowed).slice(0, 4000);
}
function randomToken() {
  const bytes = crypto.getRandomValues(new Uint8Array(24));
  return [...bytes].map((b) => b.toString(16).padStart(2, "0")).join("");
}
async function sha256(value) {
  const bytes = new TextEncoder().encode(value);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
}
function parseArray(value){try{return JSON.parse(value||"[]")}catch{return[]}}
function jsonArray(value){return JSON.stringify(Array.isArray(value)?value.slice(0,20).map((x)=>text(x,80)):[])}
function text(value,max){return String(value??"").trim().slice(0,max)}
function nullable(value,max){const result=text(value,max);return result||null}
function required(value,name){if(!text(value,1))throw new SecurityError(`${name} is required`,400)}
function enumValue(value,values,fallback){return values.includes(value)?value:fallback}
function clampInt(value,min,max){const number=Math.round(Number(value));return Math.max(min,Math.min(max,Number.isFinite(number)?number:min))}
function safeUrl(value){const raw=nullable(value,2000);if(!raw)return null;try{const url=new URL(raw);if(url.protocol!=="https:")throw new Error();return url.href}catch{throw new SecurityError("endpoint URLs must use https",400)}}
async function bodyJson(request){try{return await request.json()}catch{throw new SecurityError("request body must be JSON",400)}}
function reply(body,status=200){return new Response(JSON.stringify(body),{status,headers:JSON_HEADERS})}
export class SecurityError extends Error{constructor(message,status=400){super(message);this.status=status}}
