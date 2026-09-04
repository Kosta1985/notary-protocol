const encoder = new TextEncoder();

export class ProofError extends Error {
  constructor(message, status = 400, code = "invalid_proof_request") {
    super(message);
    this.status = status;
    this.code = code;
  }
}

export async function handleProofs(request, env, url = new URL(request.url)) {
  if (request.method === "POST" && url.pathname === "/api/v1/hash") {
    const body = await readJson(request);
    const data = Object.prototype.hasOwnProperty.call(body, "data") ? body.data : body;
    return json({ hash: await hashData(data), algorithm: "SHA-256", canonicalization: "accordtrace-json-v1" });
  }

  if (request.method === "POST" && url.pathname === "/api/v1/proofs") {
    const body = await readJson(request);
    if (!Object.prototype.hasOwnProperty.call(body, "data")) throw new ProofError("data is required");
    const proof = await createProof(env, body.data, body.metadata ?? null);
    return json(proof, 201);
  }

  if (request.method === "GET" && url.pathname.startsWith("/api/v1/proofs/")) {
    const proofId = decodeURIComponent(url.pathname.slice("/api/v1/proofs/".length));
    return json(await getProof(env, proofId));
  }

  if (request.method === "POST" && url.pathname === "/api/v1/verify") {
    const body = await readJson(request);
    return json(await verifyProof(env, body));
  }

  return null;
}

export async function createProof(env, data, metadata = null) {
  const normalizedMetadata = normalizeMetadata(metadata);
  const hash = await hashData(data);
  const proofId = `atp_${crypto.randomUUID().replaceAll("-", "")}`;
  const createdAt = new Date().toISOString();
  const unsigned = {
    version: "1",
    proof_id: proofId,
    hash,
    algorithm: "SHA-256",
    canonicalization: "accordtrace-json-v1",
    created_at: createdAt,
    metadata: normalizedMetadata
  };
  const issuer = await signProof(env, unsigned);
  const proof = { ...unsigned, issuer };
  await env.DB.prepare(
    "INSERT INTO receipts (id, deal_id, evidence_digest, valid, verified_at, receipt) VALUES (?1, ?2, ?3, 1, ?4, ?5)"
  ).bind(proofId, "accordtrace-proof-v1", hash, createdAt, JSON.stringify(proof)).run();
  return proof;
}

export async function getProof(env, proofId) {
  assertProofId(proofId);
  const row = await env.DB.prepare("SELECT receipt FROM receipts WHERE id = ?1").bind(proofId).first();
  if (!row) throw new ProofError("Proof not found", 404, "proof_not_found");
  let proof;
  try { proof = JSON.parse(row.receipt); } catch { throw new ProofError("Stored proof is invalid", 500, "stored_proof_invalid"); }
  if (proof?.proof_id !== proofId || !proof?.hash || !proof?.issuer?.signature) throw new ProofError("Stored proof is invalid", 500, "stored_proof_invalid");
  return proof;
}

export async function verifyProof(env, input) {
  const proofId = String(input?.proof_id ?? "");
  const proof = await getProof(env, proofId);
  const signatureValid = await verifyProofSignature(proof);
  let hashMatch = null;
  let suppliedHash = null;
  if (Object.prototype.hasOwnProperty.call(input ?? {}, "data")) {
    suppliedHash = await hashData(input.data);
    hashMatch = suppliedHash === proof.hash;
  } else if (typeof input?.hash === "string") {
    suppliedHash = input.hash;
    hashMatch = suppliedHash === proof.hash;
  }
  const valid = signatureValid && hashMatch !== false;
  return {
    valid,
    proof_id: proof.proof_id,
    hash: proof.hash,
    supplied_hash: suppliedHash,
    hash_match: hashMatch,
    signature_valid: signatureValid,
    created_at: proof.created_at,
    limitations: "Confirms AccordTrace-recorded hash integrity and issuer signature; does not prove truth, authorship, authority, legality, or real-world identity."
  };
}

export async function hashData(data) {
  const canonical = canonicalize(data);
  const digest = await crypto.subtle.digest("SHA-256", encoder.encode(canonical));
  return `sha256:${[...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("")}`;
}

async function signProof(env, unsigned) {
  const jwk = parseIssuerJwk(env);
  const privateKey = await crypto.subtle.importKey("jwk", jwk, { name: "Ed25519" }, false, ["sign"]);
  const signature = await crypto.subtle.sign("Ed25519", privateKey, encoder.encode(`accordtrace.proof.v1\n${canonicalize(unsigned)}`));
  return {
    algorithm: "Ed25519",
    public_jwk: { kty: "OKP", crv: "Ed25519", x: jwk.x },
    signature: base64url(new Uint8Array(signature))
  };
}

async function verifyProofSignature(proof) {
  try {
    const { issuer, ...unsigned } = proof;
    if (issuer?.algorithm !== "Ed25519" || issuer?.public_jwk?.kty !== "OKP" || issuer?.public_jwk?.crv !== "Ed25519" || !issuer?.public_jwk?.x) return false;
    const key = await crypto.subtle.importKey("jwk", issuer.public_jwk, { name: "Ed25519" }, false, ["verify"]);
    return crypto.subtle.verify(
      "Ed25519",
      key,
      fromBase64url(issuer.signature),
      encoder.encode(`accordtrace.proof.v1\n${canonicalize(unsigned)}`)
    );
  } catch {
    return false;
  }
}

function parseIssuerJwk(env) {
  let jwk;
  try { jwk = JSON.parse(env.NOTARY_PRIVATE_JWK); } catch { throw new ProofError("AccordTrace issuer signing key is unavailable", 503, "issuer_unavailable"); }
  if (jwk?.kty !== "OKP" || jwk?.crv !== "Ed25519" || typeof jwk?.x !== "string" || typeof jwk?.d !== "string") {
    throw new ProofError("AccordTrace issuer signing key is unavailable", 503, "issuer_unavailable");
  }
  return jwk;
}

function normalizeMetadata(metadata) {
  if (metadata == null) return null;
  if (!metadata || typeof metadata !== "object" || Array.isArray(metadata)) throw new ProofError("metadata must be an object or null");
  const canonical = canonicalize(metadata);
  if (encoder.encode(canonical).byteLength > 8_192) throw new ProofError("metadata exceeds 8 KiB", 413);
  return JSON.parse(canonical);
}

function assertProofId(value) {
  if (!/^atp_[a-f0-9]{32}$/i.test(String(value ?? ""))) throw new ProofError("Invalid proof_id");
}

function canonicalize(value) {
  if (value === null) return "null";
  if (typeof value === "string" || typeof value === "boolean") return JSON.stringify(value);
  if (typeof value === "number") {
    if (!Number.isFinite(value)) throw new ProofError("data contains a non-finite number");
    return Object.is(value, -0) ? "0" : JSON.stringify(value);
  }
  if (Array.isArray(value)) return `[${value.map(canonicalize).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonicalize(value[key])}`).join(",")}}`;
  }
  throw new ProofError("data must be JSON-compatible");
}

async function readJson(request) {
  const text = await request.text();
  if (encoder.encode(text).byteLength > 1_048_576) throw new ProofError("Request body exceeds 1 MiB", 413);
  try { return JSON.parse(text); } catch { throw new ProofError("Request body must be valid JSON"); }
}

function json(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" }
  });
}

function base64url(bytes) {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replaceAll("+", "-").replaceAll("/", "_").replace(/=+$/g, "");
}

function fromBase64url(value) {
  const text = String(value ?? "").replaceAll("-", "+").replaceAll("_", "/");
  const padded = text + "=".repeat((4 - (text.length % 4 || 4)) % 4);
  const binary = atob(padded);
  return Uint8Array.from(binary, (char) => char.charCodeAt(0));
}
