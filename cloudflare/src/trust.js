const JSON_HEADERS = { "content-type": "application/json; charset=utf-8" };
const MAX_BODY_BYTES = 16_384;
const MAX_FUTURE_SKEW_MS = 10 * 60 * 1000;
const MAX_ATTESTATION_AGE_MS = 30 * 24 * 60 * 60 * 1000;
let schemaReady = false;

export async function handleTrust(request, env, url = new URL(request.url)) {
  if (!url.pathname.startsWith("/api/v1/trust/")) return null;
  await ensureTrustSchema(env);

  if (request.method === "GET" && url.pathname === "/api/v1/trust/capabilities") {
    return reply({
      service: "AccordTrace Reputation Evidence",
      version: "0.1.0",
      features: ["signed_task_attestations", "bilateral_work_evidence", "signed_payment_attestations", "bilateral_payment_evidence", "reputation_evidence"],
      trust_model: "AccordTrace reports cryptographic evidence counts and counterparty diversity. It does not issue a numeric trust score or claim that self-attested identity/payment fields are independently verified.",
      custody: "AccordTrace records attestations only. It does not custody, transfer, freeze, redirect, or seize funds."
    });
  }

  if (request.method === "POST" && url.pathname === "/api/v1/trust/task-attestations") {
    const body = await bodyJson(request);
    const passport = await requirePassport(env, body.passport_id);
    const counterparty = await requirePassport(env, body.counterparty_passport_id);
    if (passport.id === counterparty.id) throw new TrustError("counterparty must use a different Passport", 400);
    const attestationId = requireCleanId(body.attestation_id, "attestation_id");
    const taskId = requireCleanId(body.task_id, "task_id");
    const role = enumValue(body.role, ["provider", "requester"], null);
    if (!role) throw new TrustError("role must be provider or requester", 400);
    const outcomes = role === "provider" ? ["delivered"] : ["accepted", "disputed"];
    const outcome = enumValue(body.outcome, outcomes, null);
    if (!outcome) throw new TrustError(`invalid ${role} outcome`, 400);
    required(body.signed_at, "signed_at");
    required(body.signature, "signature");
    assertRecent(body.signed_at);

    const task = await env.DB.prepare("SELECT id,status,artifact_digest,proof_id FROM marketplace_tasks WHERE id=?1").bind(taskId).first();
    if (!task) return reply({ error: "task_not_found" }, 404);
    if (!task.artifact_digest || !task.proof_id || !["delivered", "verified"].includes(task.status)) {
      throw new TrustError("task does not yet have proof-bound delivery evidence", 409);
    }
    const artifactDigest = text(body.artifact_digest, 256);
    const proofId = text(body.proof_id, 256);
    if (artifactDigest !== task.artifact_digest || proofId !== task.proof_id) throw new TrustError("attestation does not match task delivery evidence", 422);
    await verifyProofBinding(env, proofId, artifactDigest);

    const payload = {
      domain: "accordtrace.marketplace.task.attestation.v1",
      attestation_id: attestationId,
      task_id: taskId,
      passport_id: passport.id,
      role,
      counterparty_passport_id: counterparty.id,
      outcome,
      artifact_digest: artifactDigest,
      proof_id: proofId,
      signed_at: body.signed_at
    };
    await verifyEd25519(passport.public_key, canonicalize(payload), body.signature);
    const now = new Date().toISOString();
    const result = await env.DB.prepare(`INSERT OR IGNORE INTO task_attestations
      (id,task_id,passport_id,role,counterparty_passport_id,outcome,artifact_digest,proof_id,signature,signed_at,created_at)
      VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9,?10,?11)`)
      .bind(attestationId, taskId, passport.id, role, counterparty.id, outcome, artifactDigest, proofId, text(body.signature, 1000), body.signed_at, now).run();
    if ((result.meta?.changes ?? 1) === 0) return reply({ error: "attestation_already_recorded" }, 409);

    return reply({
      attestation: { ...payload, signature_verified: true, proof_bound: true },
      bilateral_status: await bilateralTaskStatus(env, taskId, passport.id, counterparty.id),
      reputation_effect: "evidence_only"
    }, 201);
  }

  const taskMatch = url.pathname.match(/^\/api\/v1\/trust\/tasks\/([^/]+)\/attestations$/);
  if (request.method === "GET" && taskMatch) {
    const taskId = decodeURIComponent(taskMatch[1]);
    const rows = await env.DB.prepare(`SELECT id,task_id,passport_id,role,counterparty_passport_id,outcome,artifact_digest,proof_id,signed_at,created_at
      FROM task_attestations WHERE task_id=?1 ORDER BY created_at ASC`).bind(taskId).all();
    return reply({ task_id: taskId, attestations: rows.results ?? [] });
  }

  if (request.method === "POST" && url.pathname === "/api/v1/trust/payment-attestations") {
    const body = await bodyJson(request);
    const passport = await requirePassport(env, body.passport_id);
    const counterparty = await requirePassport(env, body.counterparty_passport_id);
    if (passport.id === counterparty.id) throw new TrustError("counterparty must use a different Passport", 400);
    const attestationId = requireCleanId(body.attestation_id, "attestation_id");
    const paymentId = requireCleanId(body.payment_id, "payment_id");
    const taskId = requireCleanId(body.task_id, "task_id");
    const role = enumValue(body.role, ["payer", "payee"], null);
    if (!role) throw new TrustError("role must be payer or payee", 400);
    const rail = enumValue(body.rail, ["x402", "usdc", "stripe", "bank", "other"], null);
    if (!rail) throw new TrustError("unsupported payment rail", 400);
    const currency = String(body.currency ?? "").trim().toUpperCase();
    if (!/^[A-Z0-9]{2,12}$/.test(currency)) throw new TrustError("currency format is invalid", 400);
    const amount = String(body.amount ?? "").trim();
    if (!/^\d+(?:\.\d{1,18})?$/.test(amount)) throw new TrustError("amount must be a positive decimal string", 400);
    required(body.signed_at, "signed_at");
    required(body.signature, "signature");
    assertRecent(body.signed_at);
    const task = await env.DB.prepare("SELECT id FROM marketplace_tasks WHERE id=?1").bind(taskId).first();
    if (!task) return reply({ error: "task_not_found" }, 404);

    const payload = {
      domain: "accordtrace.payment.attestation.v1",
      attestation_id: attestationId,
      payment_id: paymentId,
      task_id: taskId,
      passport_id: passport.id,
      role,
      counterparty_passport_id: counterparty.id,
      rail,
      currency,
      amount,
      external_reference_digest: nullable(body.external_reference_digest, 256),
      signed_at: body.signed_at
    };
    await verifyEd25519(passport.public_key, canonicalize(payload), body.signature);
    const now = new Date().toISOString();
    const result = await env.DB.prepare(`INSERT OR IGNORE INTO payment_attestations
      (id,payment_id,task_id,passport_id,role,counterparty_passport_id,rail,currency,amount_text,external_reference_digest,signature,signed_at,created_at)
      VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9,?10,?11,?12,?13)`)
      .bind(attestationId, paymentId, taskId, passport.id, role, counterparty.id, rail, currency, amount, payload.external_reference_digest, text(body.signature, 1000), body.signed_at, now).run();
    if ((result.meta?.changes ?? 1) === 0) return reply({ error: "attestation_already_recorded" }, 409);

    return reply({
      attestation: { ...payload, signature_verified: true },
      bilateral_status: await bilateralPaymentStatus(env, payload),
      settlement_status: "not_independently_verified",
      custody: "none"
    }, 201);
  }

  const reputationMatch = url.pathname.match(/^\/api\/v1\/trust\/passports\/([^/]+)\/reputation$/);
  if (request.method === "GET" && reputationMatch) {
    const passportId = decodeURIComponent(reputationMatch[1]);
    if (!await getPassport(env, passportId)) return reply({ error: "passport_not_found" }, 404);
    return reply({ reputation: await buildReputationEvidence(env, passportId) });
  }

  return reply({ error: "not_found" }, 404);
}

async function buildReputationEvidence(env, passportId) {
  const taskStats = await env.DB.prepare(`SELECT
    COUNT(*) AS signed_attestations,
    COUNT(DISTINCT counterparty_passport_id) AS counterparties,
    SUM(CASE WHEN role='requester' AND outcome='disputed' THEN 1 ELSE 0 END) AS disputes
    FROM task_attestations WHERE passport_id=?1 OR counterparty_passport_id=?1`).bind(passportId).first();
  const bilateralTasks = await env.DB.prepare(`SELECT COUNT(DISTINCT p.task_id) AS count
    FROM task_attestations p
    JOIN task_attestations r ON r.task_id=p.task_id
      AND r.passport_id=p.counterparty_passport_id
      AND r.counterparty_passport_id=p.passport_id
    WHERE p.role='provider' AND p.outcome='delivered'
      AND r.role='requester' AND r.outcome='accepted'
      AND (p.passport_id=?1 OR r.passport_id=?1)`).bind(passportId).first();
  const bilateralPayments = await env.DB.prepare(`SELECT COUNT(DISTINCT a.payment_id) AS count
    FROM payment_attestations a
    JOIN payment_attestations b ON b.payment_id=a.payment_id
      AND b.passport_id=a.counterparty_passport_id
      AND b.counterparty_passport_id=a.passport_id
      AND b.task_id=a.task_id AND b.rail=a.rail AND b.currency=a.currency AND b.amount_text=a.amount_text
    WHERE a.role='payer' AND b.role='payee' AND (a.passport_id=?1 OR b.passport_id=?1)`).bind(passportId).first();
  const canaries = await env.DB.prepare("SELECT COUNT(*) AS count FROM security_events WHERE passport_id=?1 AND source='accordtrace-canary'").bind(passportId).first();
  const bilateralCount = Number(bilateralTasks?.count ?? 0);
  const counterparties = Number(taskStats?.counterparties ?? 0);
  return {
    passport_id: passportId,
    trust_score: null,
    reputation_status: "evidence_based_unscored",
    evidence_strength: evidenceStrength(bilateralCount, counterparties),
    signed_task_attestations: Number(taskStats?.signed_attestations ?? 0),
    bilateral_accepted_tasks: bilateralCount,
    distinct_cryptographic_counterparties: counterparties,
    dispute_attestations: Number(taskStats?.disputes ?? 0),
    bilateral_payment_attestations: Number(bilateralPayments?.count ?? 0),
    canary_touch_signals: Number(canaries?.count ?? 0),
    limitations: [
      "Cryptographic Passports prove key control, not legal identity.",
      "Distinct Passports may still be controlled by the same operator (Sybil risk).",
      "Payment attestations are bilateral claims unless a payment rail is independently verified.",
      "No numeric trust score is published until identity and anti-Sybil weighting are available."
    ]
  };
}

async function bilateralTaskStatus(env, taskId, passportId, counterpartyId) {
  const rows = await env.DB.prepare(`SELECT role,outcome,passport_id,counterparty_passport_id FROM task_attestations
    WHERE task_id=?1 AND ((passport_id=?2 AND counterparty_passport_id=?3) OR (passport_id=?3 AND counterparty_passport_id=?2))`).bind(taskId, passportId, counterpartyId).all();
  const list = rows.results ?? [];
  const delivered = list.some((row) => row.role === "provider" && row.outcome === "delivered");
  const accepted = list.some((row) => row.role === "requester" && row.outcome === "accepted");
  const disputed = list.some((row) => row.role === "requester" && row.outcome === "disputed");
  return disputed ? "bilateral_dispute_recorded" : delivered && accepted ? "bilateral_accepted" : "awaiting_counterparty";
}

async function bilateralPaymentStatus(env, payload) {
  const oppositeRole = payload.role === "payer" ? "payee" : "payer";
  const row = await env.DB.prepare(`SELECT id FROM payment_attestations WHERE payment_id=?1 AND task_id=?2
    AND passport_id=?3 AND counterparty_passport_id=?4 AND role=?5 AND rail=?6 AND currency=?7 AND amount_text=?8 LIMIT 1`)
    .bind(payload.payment_id, payload.task_id, payload.counterparty_passport_id, payload.passport_id, oppositeRole, payload.rail, payload.currency, payload.amount).first();
  return row ? "bilateral_payment_claim" : "awaiting_counterparty";
}

async function verifyProofBinding(env, proofId, evidenceDigest) {
  const row = await env.DB.prepare("SELECT receipt FROM receipts WHERE id=?1").bind(proofId).first();
  if (!row) throw new TrustError("proof_not_found", 422);
  let receipt;
  try { receipt = JSON.parse(row.receipt); } catch { throw new TrustError("proof_invalid", 422); }
  if (!receipt.valid || receipt.evidenceDigest !== evidenceDigest) throw new TrustError("proof_evidence_mismatch", 422);
}

async function requirePassport(env, id) {
  required(id, "passport_id");
  const passport = await getPassport(env, id);
  if (!passport) throw new TrustError("passport_not_found", 404);
  if (passport.status !== "active") throw new TrustError("passport_not_active", 403);
  return passport;
}
async function getPassport(env, id) { return env.DB.prepare("SELECT id,public_key,status FROM agent_passports WHERE id=?1").bind(id).first(); }

async function ensureTrustSchema(env) {
  if (schemaReady) return;
  const statements = [
    `CREATE TABLE IF NOT EXISTS task_attestations (
      id TEXT PRIMARY KEY, task_id TEXT NOT NULL, passport_id TEXT NOT NULL, role TEXT NOT NULL,
      counterparty_passport_id TEXT NOT NULL, outcome TEXT NOT NULL, artifact_digest TEXT NOT NULL,
      proof_id TEXT NOT NULL, signature TEXT NOT NULL, signed_at TEXT NOT NULL, created_at TEXT NOT NULL
    )`,
    `CREATE INDEX IF NOT EXISTS idx_task_attestations_passport ON task_attestations(passport_id, created_at DESC)`,
    `CREATE INDEX IF NOT EXISTS idx_task_attestations_task ON task_attestations(task_id, created_at ASC)`,
    `CREATE TABLE IF NOT EXISTS payment_attestations (
      id TEXT PRIMARY KEY, payment_id TEXT NOT NULL, task_id TEXT NOT NULL, passport_id TEXT NOT NULL,
      role TEXT NOT NULL, counterparty_passport_id TEXT NOT NULL, rail TEXT NOT NULL, currency TEXT NOT NULL,
      amount_text TEXT NOT NULL, external_reference_digest TEXT, signature TEXT NOT NULL, signed_at TEXT NOT NULL,
      created_at TEXT NOT NULL
    )`,
    `CREATE UNIQUE INDEX IF NOT EXISTS idx_payment_attestation_party ON payment_attestations(payment_id, passport_id, role)`,
    `CREATE INDEX IF NOT EXISTS idx_payment_attestations_passport ON payment_attestations(passport_id, created_at DESC)`
  ];
  if (typeof env.DB.batch === "function") await env.DB.batch(statements.map((sql) => env.DB.prepare(sql)));
  else for (const sql of statements) await env.DB.prepare(sql).run();
  schemaReady = true;
}

async function verifyEd25519(publicKeyPem, message, signature) {
  let key;
  try { key = await crypto.subtle.importKey("spki", pemBytes(publicKeyPem), { name: "Ed25519" }, false, ["verify"]); }
  catch { throw new TrustError("passport public key is invalid", 422); }
  let signatureBytes;
  try { signatureBytes = fromBase64url(signature); }
  catch { throw new TrustError("signature must be base64url", 400); }
  const valid = await crypto.subtle.verify("Ed25519", key, signatureBytes, new TextEncoder().encode(message));
  if (!valid) throw new TrustError("signature verification failed", 401);
}
function pemBytes(pem) {
  const match = String(pem).match(/-----BEGIN PUBLIC KEY-----([\s\S]+?)-----END PUBLIC KEY-----/);
  if (!match) throw new TrustError("passport public key must be SPKI PEM", 422);
  const binary = atob(match[1].replace(/\s+/g, ""));
  return Uint8Array.from(binary, (char) => char.charCodeAt(0));
}
function fromBase64url(value) { const normalized=String(value).replace(/-/g,"+").replace(/_/g,"/"); const padded=normalized+"=".repeat((4-normalized.length%4)%4); const binary=atob(padded); return Uint8Array.from(binary,(char)=>char.charCodeAt(0)); }
function canonicalize(value) {
  if (value === null || typeof value === "boolean") return JSON.stringify(value);
  if (typeof value === "number") { if (!Number.isFinite(value)) throw new TrustError("non-finite number", 400); return JSON.stringify(Object.is(value,-0)?0:value); }
  if (typeof value === "string") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonicalize).join(",")}]`;
  if (typeof value === "object") return `{${Object.keys(value).sort().map((key)=>`${JSON.stringify(key)}:${canonicalize(value[key])}`).join(",")}}`;
  throw new TrustError("unsupported signed payload value", 400);
}
function assertRecent(value) { const time=Date.parse(value); if(!Number.isFinite(time)) throw new TrustError("signed_at must be ISO-8601",400); const delta=Date.now()-time; if(delta < -MAX_FUTURE_SKEW_MS || delta > MAX_ATTESTATION_AGE_MS) throw new TrustError("signed_at is outside the allowed window",400); }
function evidenceStrength(tasks,counterparties){ if(tasks>=10&&counterparties>=5)return "established_evidence"; if(tasks>=3&&counterparties>=2)return "growing_evidence"; if(tasks>=1)return "initial_evidence"; return "no_bilateral_evidence"; }
function text(value,max){return String(value??"").trim().slice(0,max)}
function nullable(value,max){const result=text(value,max);return result||null}
function required(value,name){if(!text(value,1))throw new TrustError(`${name} is required`,400)}
function cleanId(value){const result=text(value,200);return /^[A-Za-z0-9:_\-.]{3,200}$/.test(result)?result:null}
function requireCleanId(value,name){required(value,name);const result=cleanId(value);if(!result)throw new TrustError(`${name} format is invalid`,400);return result}
function enumValue(value,values,fallback){return values.includes(value)?value:fallback}
async function bodyJson(request){const raw=await request.text();if(new TextEncoder().encode(raw).byteLength>MAX_BODY_BYTES)throw new TrustError("request body exceeds 16 KiB",413);try{return JSON.parse(raw)}catch{throw new TrustError("request body must be JSON",400)}}
function reply(body,status=200){return new Response(JSON.stringify(body),{status,headers:JSON_HEADERS})}
export class TrustError extends Error{constructor(message,status=400){super(message);this.status=status}}
