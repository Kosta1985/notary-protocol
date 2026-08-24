import { createPrivateKey, createPublicKey, generateKeyPairSync, sign, verify as verifyBytes } from "node:crypto";
import { chmodSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { canonicalize, digest } from "./canonicalize.js";
import { verifyEnvelope } from "./protocol.js";

function createOrLoadKey(keyFile) {
  if (existsSync(keyFile)) {
    return readFileSync(keyFile, "utf8");
  }

  mkdirSync(dirname(keyFile), { recursive: true });
  const { privateKey } = generateKeyPairSync("ed25519");
  const pem = privateKey.export({ type: "pkcs8", format: "pem" });
  writeFileSync(keyFile, pem, { mode: 0o600 });
  chmodSync(keyFile, 0o600);
  return pem;
}

export function createNotary({ keyFile = "./api/data/notary-key.pem", privateKey } = {}) {
  const key = privateKey ?? createOrLoadKey(keyFile);
  const privateKeyObject = key?.type === "private" ? key : createPrivateKey(key);
  const publicKey = createPublicKey(privateKeyObject).export({ type: "spki", format: "pem" });

  return {
    publicKey,
    verify(envelope, now = new Date()) {
      const checks = verifyEnvelope(envelope, now);
      const evidenceDigest = digest(envelope);
      const valid = checks.every((check) => check.passed);
      const unsigned = {
        version: "0.1",
        id: `ntr_${evidenceDigest.slice(0, 24)}`,
        dealId: typeof envelope?.id === "string" ? envelope.id : "unknown",
        evidenceDigest,
        verifiedAt: now.toISOString(),
        valid,
        checks,
        violations: checks.filter((check) => !check.passed).map((check) => check.code)
      };
      const signature = sign(null, Buffer.from(canonicalize(unsigned)), privateKeyObject).toString("base64url");
      return { ...unsigned, notary: { algorithm: "Ed25519", publicKey, signature } };
    },
    verifyReceipt(receipt) {
      const checks = [];
      const add = (code, passed) => checks.push({ code, passed: Boolean(passed) });
      const structure = receipt !== null && typeof receipt === "object" && !Array.isArray(receipt) && receipt.notary !== null && typeof receipt.notary === "object";
      add("receipt_structure", structure);
      if (!structure) return { valid: false, checks };

      const { notary: signature, ...unsigned } = receipt;
      add("receipt_algorithm", signature.algorithm === "Ed25519");
      add("trusted_notary_key", signature.publicKey === publicKey);
      let signatureValid = false;
      try {
        signatureValid = verifyBytes(
          null,
          Buffer.from(canonicalize(unsigned)),
          createPublicKey(signature.publicKey),
          Buffer.from(signature.signature, "base64url")
        );
      } catch {
        signatureValid = false;
      }
      add("receipt_signature", signatureValid);
      return { valid: checks.every((check) => check.passed), checks, receiptId: typeof receipt.id === "string" ? receipt.id : null };
    }
  };
}
