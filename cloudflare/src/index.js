const encoder = new TextEncoder();
const SPKI_ED25519_PREFIX = hex("302a300506032b6570032100");

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    try {
      if (request.method === "OPTIONS") return corsResponse(null, 204);
      if (request.method === "GET" && url.pathname === "/health") {
        return json({ status: "ok", version: "0.1.0", runtime: "cloudflare-workers" });
      }
      if (request.method === "GET" && url.pathname === "/v1/notary-key") {
        return json({ algorithm: "Ed25519", publicKey: publicPem(env) });
      }
      if (request.method === "GET" && url.pathname === "/v1/demo") {
        return json(await createSignedDemo());
      }
      if (request.method === "POST" && url.pathname === "/v1/verify") {
        const envelope = await readJson(request);
        const receipt = await createReceipt(envelope, env);
        await saveReceipt(receipt, env);
        return json(receipt, receipt.valid ? 200 : 422);
      }
      if (request.method === "POST" && url.pathname === "/v1/receipts/verify") {
        const result = await verifyReceipt(await readJson(request), env);
        return json(result, result.valid ? 200 : 422);
      }
      if (request.method === "GET" && url.pathname.startsWith("/v1/receipts/")) {
        const id = decodeURIComponent(url.pathname.slice("/v1/receipts/".length));
        const row = await env.DB.prepare("SELECT receipt FROM receipts WHERE id = ?1").bind(id).first();
        return row ? json(JSON.parse(row.receipt)) : json({ error: "receipt_not_found" }, 404);
      }
      if (request.method === "GET" && url.pathname === "/.well-known/agent-card.json") {
        return json({
          name: "Notary Protocol",
          description: "Verifies cryptographic evidence for AI-agent transactions.",
          url: `${url.origin}/a2a`,
          protocolVersion: "0.3",
          preferredTransport: "JSONRPC",
          version: "0.1.0",
          capabilities: { streaming: false, pushNotifications: false },
          defaultInputModes: ["application/json"],
          defaultOutputModes: ["application/json"],
          skills: [{ id: "verify-deal-envelope", name: "Verify DealEnvelope", description: "Checks evidence structure and Ed25519 signatures and returns a signed receipt.", tags: ["verification", "evidence", "signatures"] }]
        });
      }
      if (request.method === "GET" && url.pathname === "/openapi.json") {
        const response = await env.ASSETS.fetch(new Request(new URL("/openapi.json", request.url)));
        const specification = await response.json();
        specification.servers = [{ url: url.origin }];
        return json(specification);
      }
      if (request.method === "POST" && url.pathname === "/a2a") {
        const body = await readJson(request);
        const message = body.params?.message ?? body.message;
        const envelope = message?.parts?.find((part) => part.data?.dealEnvelope)?.data?.dealEnvelope;
        if (!envelope) throw new RequestError("A2A message must include data.dealEnvelope", 400);
        const receipt = await createReceipt(envelope, env);
        await saveReceipt(receipt, env);
        return json({
          jsonrpc: "2.0",
          id: body.id ?? null,
          result: {
            id: `task_${receipt.id}`,
            status: { state: "completed", timestamp: new Date().toISOString() },
            artifacts: [{ name: "NotaryReceipt", parts: [{ data: { notaryReceipt: receipt } }] }]
          }
        });
      }
      if (request.method === "GET") return withSecurityHeaders(await env.ASSETS.fetch(request));
      return json({ error: "not_found" }, 404);
    } catch (error) {
      return json({ error: error instanceof RequestError ? "invalid_request" : "internal_error", message: error.message }, error.status ?? 500);
    }
  }
};

class RequestError extends Error {
  constructor(message, status) {
    super(message);
    this.status = status;
  }
}

async function readJson(request) {
  const contentLength = Number(request.headers.get("content-length") ?? 0);
  if (contentLength > 1_048_576) throw new RequestError("Request body exceeds 1 MiB", 413);
  const text = await request.text();
  if (encoder.encode(text).byteLength > 1_048_576) throw new RequestError("Request body exceeds 1 MiB", 413);
  try {
    return JSON.parse(text);
  } catch {
    throw new RequestError("Request body must be valid JSON", 400);
  }
}

async function createReceipt(envelope, env, now = new Date()) {
  const checks = await verifyEnvelope(envelope, now);
  const evidenceDigest = await digest(envelope);
  const unsigned = {
    version: "0.1",
    id: `ntr_${evidenceDigest.slice(0, 24)}`,
    dealId: typeof envelope?.id === "string" ? envelope.id : "unknown",
    evidenceDigest,
    verifiedAt: now.toISOString(),
    valid: checks.every((check) => check.passed),
    checks,
    violations: checks.filter((check) => !check.passed).map((check) => check.code)
  };
  const privateJwk = JSON.parse(env.NOTARY_PRIVATE_JWK);
  const privateKey = await crypto.subtle.importKey("jwk", privateJwk, { name: "Ed25519" }, false, ["sign"]);
  const signature = await crypto.subtle.sign("Ed25519", privateKey, encoder.encode(canonicalize(unsigned)));
  return { ...unsigned, notary: { algorithm: "Ed25519", publicKey: publicPem(env), signature: base64url(new Uint8Array(signature)) } };
}

async function saveReceipt(receipt, env) {
  await env.DB.prepare(
    "INSERT INTO receipts (id, deal_id, evidence_digest, valid, verified_at, receipt) VALUES (?1, ?2, ?3, ?4, ?5, ?6) ON CONFLICT(id) DO UPDATE SET valid = excluded.valid, verified_at = excluded.verified_at, receipt = excluded.receipt"
  ).bind(receipt.id, receipt.dealId, receipt.evidenceDigest, receipt.valid ? 1 : 0, receipt.verifiedAt, JSON.stringify(receipt)).run();
}

async function verifyEnvelope(envelope, now = new Date()) {
  const checks = [];
  const add = (code, passed) => checks.push({ code, passed: Boolean(passed) });
  const object = (value) => value !== null && typeof value === "object" && !Array.isArray(value);
  const date = (value) => typeof value === "string" && !Number.isNaN(Date.parse(value));
  add("structure", object(envelope));
  if (!object(envelope)) return checks;
  add("version", envelope.version === "0.1");
  add("deal_id", typeof envelope.id === "string" && envelope.id.length > 0 && envelope.id.length <= 200);
  add("created_at", date(envelope.createdAt));
  add("parties", object(envelope.initiator) && object(envelope.counterparty));
  add("distinct_parties", envelope.initiator?.id && envelope.counterparty?.id && envelope.initiator.id !== envelope.counterparty.id);
  add("offer", object(envelope.offer) && typeof envelope.offer.id === "string" && object(envelope.offer.terms) && date(envelope.offer.createdAt) && typeof envelope.offer.nonce === "string" && envelope.offer.nonce.length >= 16);
  add("acceptance", object(envelope.acceptance) && date(envelope.acceptance.acceptedAt) && typeof envelope.acceptance.nonce === "string" && envelope.acceptance.nonce.length >= 16);
  add("offer_link", envelope.acceptance?.offerId === envelope.offer?.id);
  add("creation_order", date(envelope.createdAt) && date(envelope.offer?.createdAt) && Date.parse(envelope.offer.createdAt) >= Date.parse(envelope.createdAt));
  add("time_order", date(envelope.offer?.createdAt) && date(envelope.acceptance?.acceptedAt) && Date.parse(envelope.acceptance.acceptedAt) >= Date.parse(envelope.offer.createdAt));
  add("expiry_order", envelope.expiresAt == null || (date(envelope.expiresAt) && date(envelope.acceptance?.acceptedAt) && Date.parse(envelope.expiresAt) >= Date.parse(envelope.acceptance.acceptedAt)));
  add("not_expired", envelope.expiresAt == null || (date(envelope.expiresAt) && Date.parse(envelope.expiresAt) >= now.getTime()));
  add("signature_set", Array.isArray(envelope.signatures) && envelope.signatures.length === 2 && new Set(envelope.signatures.map((item) => item?.role)).size === 2);
  add("initiator_signature", Array.isArray(envelope.signatures) && await verifyEnvelopeSignature(envelope, "initiator"));
  add("counterparty_signature", Array.isArray(envelope.signatures) && await verifyEnvelopeSignature(envelope, "counterparty"));
  return checks;
}

async function verifyEnvelopeSignature(envelope, role) {
  const signature = envelope.signatures.find((item) => item?.role === role);
  if (!signature || signature.algorithm !== "Ed25519" || !envelope[role]?.publicKey) return false;
  try {
    const key = await crypto.subtle.importKey("spki", pemBytes(envelope[role].publicKey), { name: "Ed25519" }, false, ["verify"]);
    return crypto.subtle.verify("Ed25519", key, fromBase64url(signature.value), encoder.encode(canonicalize(signingPayload(envelope, role))));
  } catch {
    return false;
  }
}

async function verifyReceipt(receipt, env) {
  const checks = [];
  const add = (code, passed) => checks.push({ code, passed: Boolean(passed) });
  const structure = receipt !== null && typeof receipt === "object" && !Array.isArray(receipt) && receipt.notary !== null && typeof receipt.notary === "object";
  add("receipt_structure", structure);
  if (!structure) return { valid: false, checks, receiptId: null };
  const { notary, ...unsigned } = receipt;
  add("receipt_algorithm", notary.algorithm === "Ed25519");
  add("trusted_notary_key", notary.publicKey === publicPem(env));
  let signatureValid = false;
  try {
    const key = await crypto.subtle.importKey("spki", pemBytes(notary.publicKey), { name: "Ed25519" }, false, ["verify"]);
    signatureValid = await crypto.subtle.verify("Ed25519", key, fromBase64url(notary.signature), encoder.encode(canonicalize(unsigned)));
  } catch {
    signatureValid = false;
  }
  add("receipt_signature", signatureValid);
  return { valid: checks.every((check) => check.passed), checks, receiptId: typeof receipt.id === "string" ? receipt.id : null };
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

async function createSignedDemo(now = new Date()) {
  const initiatorKeys = await crypto.subtle.generateKey({ name: "Ed25519" }, true, ["sign", "verify"]);
  const counterpartyKeys = await crypto.subtle.generateKey({ name: "Ed25519" }, true, ["sign", "verify"]);
  const timestamp = now.toISOString();
  const envelope = {
    version: "0.1", id: `deal_${randomId()}`, createdAt: timestamp,
    expiresAt: new Date(now.getTime() + 86_400_000).toISOString(),
    initiator: { id: "agent:atlas", publicKey: await exportPublicPem(initiatorKeys.publicKey) },
    counterparty: { id: "agent:relay", publicKey: await exportPublicPem(counterpartyKeys.publicKey) },
    offer: { id: `offer_${randomId()}`, createdAt: timestamp, nonce: randomId(16), terms: { action: "summarize_document", inputDigest: "sha256:demo-input", outputFormat: "application/json", deadline: new Date(now.getTime() + 3_600_000).toISOString() } },
    acceptance: { offerId: "", acceptedAt: new Date(now.getTime() + 1_000).toISOString(), nonce: randomId(16) },
    signatures: []
  };
  envelope.acceptance.offerId = envelope.offer.id;
  for (const [role, keys] of [["initiator", initiatorKeys], ["counterparty", counterpartyKeys]]) {
    const value = await crypto.subtle.sign("Ed25519", keys.privateKey, encoder.encode(canonicalize(signingPayload(envelope, role))));
    envelope.signatures.push({ role, algorithm: "Ed25519", value: base64url(new Uint8Array(value)) });
  }
  return envelope;
}

export function canonicalize(value) {
  if (value === null || typeof value === "boolean") return JSON.stringify(value);
  if (typeof value === "string") { assertUnicode(value); return JSON.stringify(value); }
  if (typeof value === "number") {
    if (!Number.isFinite(value)) throw new TypeError("Non-finite numbers are not canonical JSON");
    return JSON.stringify(Object.is(value, -0) ? 0 : value);
  }
  if (Array.isArray(value)) return `[${value.map(canonicalize).join(",")}]`;
  if (typeof value === "object") return `{${Object.keys(value).sort().map((key) => { assertUnicode(key); return `${JSON.stringify(key)}:${canonicalize(value[key])}`; }).join(",")}}`;
  throw new TypeError(`Unsupported canonical JSON value: ${typeof value}`);
}

function assertUnicode(value) {
  for (let index = 0; index < value.length; index += 1) {
    const code = value.charCodeAt(index);
    if (code >= 0xd800 && code <= 0xdbff) {
      const next = value.charCodeAt(index + 1);
      if (!(next >= 0xdc00 && next <= 0xdfff)) throw new TypeError("Lone surrogate is not canonical JSON");
      index += 1;
    } else if (code >= 0xdc00 && code <= 0xdfff) throw new TypeError("Lone surrogate is not canonical JSON");
  }
}

async function digest(value) {
  return base64url(new Uint8Array(await crypto.subtle.digest("SHA-256", encoder.encode(canonicalize(value)))));
}

function publicPem(env) {
  const jwk = JSON.parse(env.NOTARY_PRIVATE_JWK);
  const raw = fromBase64url(jwk.x);
  const der = new Uint8Array(SPKI_ED25519_PREFIX.length + raw.length);
  der.set(SPKI_ED25519_PREFIX);
  der.set(raw, SPKI_ED25519_PREFIX.length);
  return pem("PUBLIC KEY", der);
}

async function exportPublicPem(key) {
  return pem("PUBLIC KEY", new Uint8Array(await crypto.subtle.exportKey("spki", key)));
}

function pem(label, bytes) {
  const encoded = toBase64(bytes).match(/.{1,64}/g).join("\n");
  return `-----BEGIN ${label}-----\n${encoded}\n-----END ${label}-----\n`;
}

function pemBytes(value) {
  return Uint8Array.from(atob(value.replace(/-----[^-]+-----/g, "").replace(/\s/g, "")), (character) => character.charCodeAt(0));
}

function randomId(length = 9) {
  const bytes = new Uint8Array(length);
  crypto.getRandomValues(bytes);
  return base64url(bytes);
}

function base64url(bytes) { return toBase64(bytes).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, ""); }
function fromBase64url(value) { const normalized = value.replace(/-/g, "+").replace(/_/g, "/"); return Uint8Array.from(atob(normalized.padEnd(Math.ceil(normalized.length / 4) * 4, "=")), (character) => character.charCodeAt(0)); }
function toBase64(bytes) { let binary = ""; for (const byte of bytes) binary += String.fromCharCode(byte); return btoa(binary); }
function hex(value) { return Uint8Array.from(value.match(/../g), (byte) => Number.parseInt(byte, 16)); }

function json(body, status = 200) {
  return new Response(body === null ? null : JSON.stringify(body), { status, headers: securityHeaders({ "content-type": "application/json; charset=utf-8", "cache-control": "no-store", "access-control-allow-origin": "*" }) });
}

function corsResponse(body, status) {
  return new Response(body, { status, headers: securityHeaders({ "access-control-allow-origin": "*", "access-control-allow-methods": "GET,POST,OPTIONS", "access-control-allow-headers": "content-type" }) });
}

function withSecurityHeaders(response) {
  const secured = new Response(response.body, response);
  for (const [name, value] of Object.entries(securityHeaders())) secured.headers.set(name, value);
  return secured;
}

function securityHeaders(extra = {}) {
  return {
    "content-security-policy": "default-src 'self'; script-src 'self'; style-src 'self'; connect-src 'self'; img-src 'self' data:; frame-ancestors 'none'; base-uri 'self'; form-action 'self'",
    "referrer-policy": "no-referrer",
    "x-content-type-options": "nosniff",
    "x-frame-options": "DENY",
    ...extra
  };
}
