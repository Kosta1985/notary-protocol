import test from "node:test";
import assert from "node:assert/strict";
import { webcrypto } from "node:crypto";
import { canonicalize, signSecurityPayload } from "../../sdk/typescript/dist/index.js";
import { taskAttestationPayload, paymentAttestationPayload } from "../../sdk/typescript/dist/trust.js";

if (!globalThis.crypto) globalThis.crypto = webcrypto;

function decodeBase64url(value) {
  const normalized = value.replace(/-/g, "+").replace(/_/g, "/");
  const padded = normalized + "=".repeat((4 - normalized.length % 4) % 4);
  return Buffer.from(padded, "base64");
}

test("task attestation helper produces an Ed25519-verifiable domain-separated payload", async () => {
  const keys = await crypto.subtle.generateKey({ name: "Ed25519" }, true, ["sign", "verify"]);
  const payload = taskAttestationPayload({
    attestation_id: "att_123",
    task_id: "job_123",
    passport_id: "agtp_provider",
    role: "provider",
    counterparty_passport_id: "agtp_requester",
    outcome: "delivered",
    artifact_digest: "sha256:artifact",
    proof_id: "ntr_proof",
    signed_at: "2026-09-04T09:00:00.000Z"
  });
  assert.equal(payload.domain, "accordtrace.marketplace.task.attestation.v1");
  const signature = await signSecurityPayload(keys.privateKey, payload);
  const valid = await crypto.subtle.verify(
    "Ed25519",
    keys.publicKey,
    decodeBase64url(signature),
    new TextEncoder().encode(canonicalize(payload))
  );
  assert.equal(valid, true);
});

test("payment attestation helper normalizes currency and preserves claim-only fields", () => {
  const payload = paymentAttestationPayload({
    attestation_id: "payatt_123",
    payment_id: "pay_123",
    task_id: "job_123",
    passport_id: "agtp_payer",
    role: "payer",
    counterparty_passport_id: "agtp_payee",
    rail: "x402",
    currency: "usdc",
    amount: "0.050000",
    signed_at: "2026-09-04T09:00:00.000Z"
  });
  assert.equal(payload.domain, "accordtrace.payment.attestation.v1");
  assert.equal(payload.currency, "USDC");
  assert.equal(payload.amount, "0.050000");
  assert.equal(payload.external_reference_digest, null);
});
