const JSON_HEADERS = { "content-type": "application/json; charset=utf-8" };
const MAX_BODY_BYTES = 16_384;
const MAX_CLOCK_SKEW_MS = 10 * 60 * 1000;
let schemaReady = false;

const EVENT_POLICY = {
  tool_scope_violation: 55,
  network_policy_violation: 65,
  secret_access_attempt: 80,
  identity_mismatch: 90,
  payment_anomaly: 70,
  containment: 60,
  recovery: 20,
  observation: 10
};

export async function handleSecurity(request, env, url = new URL(request.url)) {
  if (!url.pathname.startsWith("/api/v1/security/")) return null;
  await ensureSecuritySchema(env);

  if (request.method === "GET" && url.pathname === "/api/v1/security/capabilities") {
    return reply({
      service: "AccordTrace Agent Security & Trust",
      version: "0.1.0",
      features: ["cryptographic_agent_passport", "signed_security_events", "containment_recommendations", "passive_canaries"],
      identity: "Agent Passport IDs are derived from an Ed25519 public key. Profile changes must be signed by the same key.",
      reputation: "No public numeric trust score is issued yet. Security signals and marketplace claims remain separate until a cryptographically bound reputation layer is available.",
      safety: "Canaries are passive signals only. AccordTrace does not exploit agents, access third-party systems, capture credentials, or transfer funds."
    });
  }

  if (request.method === "POST" && url.pathname === "/api/v1/security/passports") {
    const body = await bodyJson(request);
    required(body.public_key, "public_key");
    required(body.issued_at, "issued_at");
    required(body.signature, "signature");
    assertFresh(body.issued_at);

    const publicKey = text(body.public_key, 4000);
    const passportId = await passportIdFor(publicKey);
    const profile = {
      domain: "accordtrace.passport.profile.v1",
      passport_id: passportId,
      public_key: publicKey,
      marketplace_agent_id: nullable(body.marketplace_agent_id, 200),
      identity_ref: safeUrl(body.identity_ref),
      payment_endpoint: safeUrl(body.payment_endpoint),
      payment_methods: arrayText(body.payment_methods, 20, 80),
      issued_at: body.issued_at
    };
    await verifyEd25519(publicKey, canonicalize(profile), body.signature);

    const existing = await env.DB.prepare("SELECT last_signed_at FROM agent_passports WHERE id=?1").bind(passportId).first();
    if (existing?.last_signed_at && Date.parse(body.issued_at) <= Date.parse(existing.last_signed_at)) {
      throw new SecurityError("profile signature is not newer than the stored profile", 409);
    }

    const now = new Date().toISOString();
    await env.DB.prepare(`INSERT INTO agent_passports
      (id,public_key,marketplace_agent_id,identity_ref,payment_endpoint,payment_methods_json,status,last_signed_at,created_at,updated_at)
      VALUES (?1,?2,?3,?4,?5,?6,'active',?7,?8,?8)
      ON CONFLICT(id) DO UPDATE SET
        marketplace_agent_id=excluded.marketplace_agent_id,
        identity_ref=excluded.identity_ref,
        payment_endpoint=excluded.payment_endpoint,
        payment_methods_json=excluded.payment_methods_json,
        status='active',
        last_signed_at=excluded.last_signed_at,
        updated_at=excluded.updated_at`)
      .bind(passportId, publicKey, profile.marketplace_agent_id, profile.identity_ref, profile.payment_endpoint, JSON.stringify(profile.payment_methods), body.issued_at, now).run();

    return reply({ passport: await buildPassport(env, passportId) }, existing ? 200 : 201);
  }

  const passportMatch = url.pathname.match(/^\/api\/v1\/security\/passports\/([^/]+)$/);
  if (request.method === "GET" && passportMatch) {
    const passport = await buildPassport(env, decodeURIComponent(passportMatch[1]));
    return passport ? reply({ passport }) : reply({ error: "passport_not_found" }, 404);
  }

  if (request.method === "POST" && url.pathname === "/api/v1/security/events") {
    const body = await bodyJson(request);
    required(body.passport_id, "passport_id");
    required(body.event_id, "event_id");
    required(body.type, "type");
    required(body.observed_at, "observed_at");
    required(body.signature, "signature");
    assertFresh(body.observed_at, 24 * 60 * 60 * 1000);

    const passport = await getPassport(env, body.passport_id);
    if (!passport) return reply({ error: "passport_not_found" }, 404);
    const type = enumValue(body.type, Object.keys(EVENT_POLICY), null);
    if (!type) throw new SecurityError("unsupported event type", 400);
    const severity = clampInt(body.severity ?? EVENT_POLICY[type], 0, 100);
    const eventId = cleanId(body.event_id);
    if (!eventId) throw new SecurityError("event_id format is invalid", 400);
    const event = {
      domain: "accordtrace.security.event.v1",
      passport_id: passport.id,
      event_id: eventId,
      type,
      severity,
      evidence_digest: nullable(body.evidence_digest, 256),
      proof_id: nullable(body.proof_id, 256),
      source: "self",
      metadata: safeMetadataObject(body.metadata),
      observed_at: body.observed_at
    };
    await verifyEd25519(passport.public_key, canonicalize(event), body.signature);

    let proofBound = false;
    if (event.proof_id) proofBound = await verifyProofBinding(env, event.proof_id, event.evidence_digest);
    const recommendation = actionFor(type, severity);
    const now = new Date().toISOString();
    const result = await env.DB.prepare(`INSERT OR IGNORE INTO security_events
      (id,passport_id,event_type,severity,signature_verified,proof_bound,recommended_action,evidence_digest,proof_id,source,metadata_json,observed_at,created_at)
      VALUES (?1,?2,?3,?4,1,?5,?6,?7,?8,'self',?9,?10,?11)`)
      .bind(eventId, passport.id, type, severity, proofBound ? 1 : 0, recommendation, event.evidence_digest, event.proof_id, JSON.stringify(event.metadata), event.observed_at, now).run();
    if ((result.meta?.changes ?? 1) === 0) return reply({ error: "event_already_recorded" }, 409);
    await env.DB.prepare("UPDATE agent_passports SET last_event_at=?1,updated_at=?1 WHERE id=?2").bind(now, passport.id).run();

    return reply({
      event: { id: eventId, passport_id: passport.id, type, severity, signature_verified: true, proof_bound: proofBound, recommended_action: recommendation, observed_at: event.observed_at },
      reputation_effect: "none",
      note: "Signed security events are evidence signals. They do not change a public trust score in v0.1."
    }, 201);
  }

  if (request.method === "POST" && url.pathname === "/api/v1/security/canaries") {
    const body = await bodyJson(request);
    required(body.passport_id, "passport_id");
    required(body.label, "label");
    required(body.issued_at, "issued_at");
    required(body.signature, "signature");
    assertFresh(body.issued_at);
    const passport = await getPassport(env, body.passport_id);
    if (!passport) return reply({ error: "passport_not_found" }, 404);
    const requestPayload = {
      domain: "accordtrace.security.canary.create.v1",
      passport_id: passport.id,
      label: text(body.label, 160),
      issued_at: body.issued_at
    };
    await verifyEd25519(passport.public_key, canonicalize(requestPayload), body.signature);

    const token = randomToken();
    const tokenHash = await sha256(token);
    const id = `cny_${crypto.randomUUID()}`;
    const now = new Date().toISOString();
    await env.DB.prepare(`INSERT INTO security_canaries
      (id,passport_id,label,token_hash,active,touch_count,created_at)
      VALUES (?1,?2,?3,?4,1,0,?5)`)
      .bind(id, passport.id, requestPayload.label, tokenHash, now).run();
    return reply({
      canary: {
        id,
        passport_id: passport.id,
        label: requestPayload.label,
        token,
        touch_url: `${url.origin}/api/v1/security/canaries/touch/${encodeURIComponent(token)}`,
        deploy_notice: "Deploy only in infrastructure you own or are authorized to test. The endpoint records no source IP and never captures credentials."
      }
    }, 201);
  }

  const touchMatch = url.pathname.match(/^\/api\/v1\/security\/canaries\/touch\/([^/]+)$/);
  if (touchMatch && (request.method === "GET" || request.method === "POST")) {
    const tokenHash = await sha256(decodeURIComponent(touchMatch[1]));
    const canary = await env.DB.prepare("SELECT id,passport_id,label FROM security_canaries WHERE token_hash=?1 AND active=1").bind(tokenHash).first();
    if (!canary) return new Response(null, { status: 204 });
    const now = new Date().toISOString();
    await env.DB.prepare("UPDATE security_canaries SET touch_count=touch_count+1,last_touched_at=?1 WHERE id=?2").bind(now, canary.id).run();
    await env.DB.prepare(`INSERT INTO security_events
      (id,passport_id,event_type,severity,signature_verified,proof_bound,recommended_action,source,metadata_json,observed_at,created_at)
      VALUES (?1,?2,'canary_touch',90,0,0,'isolate','accordtrace-canary',?3,?4,?4)`)
      .bind(`sec_${crypto.randomUUID()}`, canary.passport_id, JSON.stringify({ canary_id: canary.id, label: canary.label }), now).run();
    await env.DB.prepare("UPDATE agent_passports SET last_event_at=?1,updated_at=?1 WHERE id=?2").bind(now, canary.passport_id).run();
    return new Response(null, { status: 204 });
  }

  if (request.method === "POST" && url.pathname === "/api/v1/security/canaries/check") {
    const body = await bodyJson(request);
    required(body.token, "token");
    const tokenHash = await sha256(String(body.token));
    const canary = await env.DB.prepare("SELECT id,passport_id,label,active,touch_count,last_touched_at,created_at FROM security_canaries WHERE token_hash=?1").bind(tokenHash).first();
    return canary ? reply({ canary }) : reply({ error: "canary_not_found" }, 404);
  }

  return reply({ error: "not_found" }, 404);
}

async function buildPassport(env, id) {
  const row = await getPassport(env, id);
  if (!row) return null;
  const events = await env.DB.prepare(`SELECT
      COUNT(*) AS signal_count,
      SUM(CASE WHEN signature_verified=1 THEN 1 ELSE 0 END) AS signed_count,
      SUM(CASE WHEN proof_bound=1 THEN 1 ELSE 0 END) AS proof_bound_count,
      SUM(CASE WHEN source='accordtrace-canary' THEN 1 ELSE 0 END) AS canary_count
    FROM security_events WHERE passport_id=?1`).bind(id).first();
  return {
    id: row.id,
    public_key_fingerprint: row.id.slice("agtp_".length),
    marketplace_agent_id: row.marketplace_agent_id,
    marketplace_binding_status: row.marketplace_agent_id ? "claimed_not_verified" : "none",
    identity_ref: row.identity_ref,
    identity_ref_status: row.identity_ref ? "self_attested" : "none",
    payment_endpoint: row.payment_endpoint,
    payment_endpoint_status: row.payment_endpoint ? "self_attested" : "none",
    payment_methods: parseArray(row.payment_methods_json),
    status: row.status,
    identity_control: "ed25519_signature_verified",
    reputation_status: "provisional_unscored",
    trust_score: null,
    security_signals: Number(events?.signal_count ?? 0),
    signed_security_signals: Number(events?.signed_count ?? 0),
    proof_bound_security_signals: Number(events?.proof_bound_count ?? 0),
    canary_touch_signals: Number(events?.canary_count ?? 0),
    last_event_at: row.last_event_at,
    created_at: row.created_at,
    updated_at: row.updated_at,
    note: "AccordTrace v0.1 verifies control of the passport key. External identity, marketplace ownership, payments, and public reputation are not implied."
  };
}

async function getPassport(env, id) {
  return env.DB.prepare("SELECT * FROM agent_passports WHERE id=?1").bind(id).first();
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

async function ensureSecuritySchema(env) {
  if (schemaReady) return;
  const statements = [
    `CREATE TABLE IF NOT EXISTS agent_passports (
      id TEXT PRIMARY KEY, public_key TEXT NOT NULL UNIQUE, marketplace_agent_id TEXT, identity_ref TEXT,
      payment_endpoint TEXT, payment_methods_json TEXT NOT NULL DEFAULT '[]', status TEXT NOT NULL DEFAULT 'active',
      last_signed_at TEXT NOT NULL, last_event_at TEXT, created_at TEXT NOT NULL, updated_at TEXT NOT NULL
    )`,
    `CREATE TABLE IF NOT EXISTS security_events (
      id TEXT PRIMARY KEY, passport_id TEXT NOT NULL, event_type TEXT NOT NULL, severity INTEGER NOT NULL,
      signature_verified INTEGER NOT NULL DEFAULT 0, proof_bound INTEGER NOT NULL DEFAULT 0,
      recommended_action TEXT NOT NULL, evidence_digest TEXT, proof_id TEXT, source TEXT NOT NULL,
      metadata_json TEXT NOT NULL DEFAULT '{}', observed_at TEXT NOT NULL, created_at TEXT NOT NULL
    )`,
    `CREATE INDEX IF NOT EXISTS idx_security_events_passport_created ON security_events(passport_id, created_at DESC)`,
    `CREATE TABLE IF NOT EXISTS security_canaries (
      id TEXT PRIMARY KEY, passport_id TEXT NOT NULL, label TEXT NOT NULL, token_hash TEXT NOT NULL UNIQUE,
      active INTEGER NOT NULL DEFAULT 1, touch_count INTEGER NOT NULL DEFAULT 0, last_touched_at TEXT, created_at TEXT NOT NULL
    )`,
    `CREATE INDEX IF NOT EXISTS idx_security_canaries_passport ON security_canaries(passport_id, created_at DESC)`
  ];
  if (typeof env.DB.batch === "function") await env.DB.batch(statements.map((sql) => env.DB.prepare(sql)));
  else for (const sql of statements) await env.DB.prepare(sql).run();
  schemaReady = true;
}

async function passportIdFor(publicKey) {
  const bytes = pemBytes(publicKey);
  return `agtp_${await sha256Bytes(bytes)}`;
}
async function verifyEd25519(publicKeyPem, message, signature) {
  let key;
  try { key = await crypto.subtle.importKey("spki", pemBytes(publicKeyPem), { name: "Ed25519" }, false, ["verify"]); }
  catch { throw new SecurityError("public_key must be a valid Ed25519 SPKI PEM key", 400); }
  let signatureBytes;
  try { signatureBytes = fromBase64url(signature); }
  catch { throw new SecurityError("signature must be base64url", 400); }
  const valid = await crypto.subtle.verify("Ed25519", key, signatureBytes, new TextEncoder().encode(message));
  if (!valid) throw new SecurityError("signature verification failed", 401);
}
function pemBytes(pem) {
  const match = String(pem).match(/-----BEGIN PUBLIC KEY-----([\s\S]+?)-----END PUBLIC KEY-----/);
  if (!match) throw new SecurityError("public_key must be SPKI PEM", 400);
  const binary = atob(match[1].replace(/\s+/g, ""));
  return Uint8Array.from(binary, (char) => char.charCodeAt(0));
}
function canonicalize(value) {
  if (value === null || typeof value === "boolean") return JSON.stringify(value);
  if (typeof value === "number") { if (!Number.isFinite(value)) throw new SecurityError("non-finite number", 400); return JSON.stringify(Object.is(value, -0) ? 0 : value); }
  if (typeof value === "string") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonicalize).join(",")}]`;
  if (typeof value === "object") return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonicalize(value[key])}`).join(",")}}`;
  throw new SecurityError("unsupported signed payload value", 400);
}
function actionFor(type, severity) {
  if (type === "identity_mismatch" || severity >= 90) return "isolate";
  if (severity >= 70) return "restrict";
  if (severity >= 50) return "challenge";
  return "observe";
}
function assertFresh(value, windowMs = MAX_CLOCK_SKEW_MS) {
  const time = Date.parse(value);
  if (!Number.isFinite(time)) throw new SecurityError("timestamp must be ISO-8601", 400);
  if (Math.abs(Date.now() - time) > windowMs) throw new SecurityError("signed timestamp is outside the allowed window", 400);
}
function safeMetadataObject(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  const allowed = {};
  for (const [key, item] of Object.entries(value).slice(0, 20)) {
    if (!/^[A-Za-z0-9_.-]{1,60}$/.test(key)) continue;
    if (["string","number","boolean"].includes(typeof item)) allowed[key] = typeof item === "string" ? item.slice(0, 300) : item;
  }
  return allowed;
}
function randomToken() { const bytes = crypto.getRandomValues(new Uint8Array(24)); return [...bytes].map((b) => b.toString(16).padStart(2, "0")).join(""); }
async function sha256(value) { return sha256Bytes(new TextEncoder().encode(value)); }
async function sha256Bytes(bytes) { const digest = await crypto.subtle.digest("SHA-256", bytes); return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join(""); }
function fromBase64url(value) { const normalized=String(value).replace(/-/g,"+").replace(/_/g,"/"); const padded=normalized+"=".repeat((4-normalized.length%4)%4); const binary=atob(padded); return Uint8Array.from(binary,(c)=>c.charCodeAt(0)); }
function parseArray(value){try{return JSON.parse(value||"[]")}catch{return[]}}
function arrayText(value,limit,max){return Array.isArray(value)?value.slice(0,limit).map((x)=>text(x,max)):[]}
function text(value,max){return String(value??"").trim().slice(0,max)}
function nullable(value,max){const result=text(value,max);return result||null}
function required(value,name){if(!text(value,1))throw new SecurityError(`${name} is required`,400)}
function enumValue(value,values,fallback){return values.includes(value)?value:fallback}
function cleanId(value){const result=text(value,200);return /^[A-Za-z0-9:_\-.]{3,200}$/.test(result)?result:null}
function clampInt(value,min,max){const number=Math.round(Number(value));return Math.max(min,Math.min(max,Number.isFinite(number)?number:min))}
function safeUrl(value){const raw=nullable(value,2000);if(!raw)return null;try{const url=new URL(raw);if(url.protocol!=="https:")throw new Error();return url.href}catch{throw new SecurityError("endpoint URLs must use https",400)}}
async function bodyJson(request){const textBody=await request.text();if(new TextEncoder().encode(textBody).byteLength>MAX_BODY_BYTES)throw new SecurityError("request body exceeds 16 KiB",413);try{return JSON.parse(textBody)}catch{throw new SecurityError("request body must be JSON",400)}}
function reply(body,status=200){return new Response(JSON.stringify(body),{status,headers:JSON_HEADERS})}
export class SecurityError extends Error{constructor(message,status=400){super(message);this.status=status}}
