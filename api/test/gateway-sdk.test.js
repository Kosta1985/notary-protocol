import test from "node:test";
import assert from "node:assert/strict";
import { webcrypto } from "node:crypto";
import { canonicalize, signSecurityPayload } from "../../sdk/typescript/dist/index.js";
import {
  capabilityLeasePayload,
  authorizationRequestPayload,
  revokeLeasePayload,
  leaseStatusPayload
} from "../../sdk/typescript/dist/gateway.js";

if (!globalThis.crypto) globalThis.crypto = webcrypto;

function decodeBase64url(value) {
  const normalized = value.replace(/-/g, "+").replace(/_/g, "/");
  const padded = normalized + "=".repeat((4 - normalized.length % 4) % 4);
  return Buffer.from(padded, "base64");
}

test("capability lease payload normalizes actions origins and verifies Ed25519", async () => {
  const keys = await crypto.subtle.generateKey({ name: "Ed25519" }, true, ["sign", "verify"]);
  const payload = capabilityLeasePayload({
    lease_id: "lease_123",
    issuer_passport_id: "agtp_issuer",
    subject_passport_id: "agtp_subject",
    allowed_actions: ["GitHub.Read", "github.read", "HTTP.Fetch"],
    allowed_origins: ["https://api.github.com/repos/x", "https://example.com/path"],
    max_calls: 25,
    issued_at: "2026-09-04T09:00:00.000Z",
    expires_at: "2026-09-05T19:00:00+10:00"
  });
  assert.equal(payload.domain, "accordtrace.gateway.capability.lease.v1");
  assert.deepEqual(payload.allowed_actions, ["github.read", "http.fetch"]);
  assert.deepEqual(payload.allowed_origins, ["https://api.github.com", "https://example.com"]);
  assert.equal(payload.expires_at, "2026-09-05T09:00:00.000Z");
  const signature = await signSecurityPayload(keys.privateKey, payload);
  const valid = await crypto.subtle.verify(
    "Ed25519",
    keys.publicKey,
    decodeBase64url(signature),
    new TextEncoder().encode(canonicalize(payload))
  );
  assert.equal(valid, true);
});

test("authorization revoke and status helpers use separate signature domains", () => {
  const auth = authorizationRequestPayload({
    request_id: "req_123",
    lease_id: "lease_123",
    subject_passport_id: "agtp_subject",
    action: "HTTP.Fetch",
    target_origin: "https://example.com/private/path",
    observed_at: "2026-09-04T09:00:00.000Z"
  });
  assert.equal(auth.domain, "accordtrace.gateway.authorization.request.v1");
  assert.equal(auth.action, "http.fetch");
  assert.equal(auth.target_origin, "https://example.com");

  assert.equal(revokeLeasePayload({
    lease_id: "lease_123",
    issuer_passport_id: "agtp_issuer",
    revoked_at: "2026-09-04T09:00:00.000Z"
  }).domain, "accordtrace.gateway.capability.revoke.v1");

  assert.equal(leaseStatusPayload({
    lease_id: "lease_123",
    passport_id: "agtp_subject",
    checked_at: "2026-09-04T09:00:00.000Z"
  }).domain, "accordtrace.gateway.capability.status.v1");
});
