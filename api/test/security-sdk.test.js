import test from "node:test";
import assert from "node:assert/strict";
import { webcrypto } from "node:crypto";
import {
  canonicalize,
  passportIdFromSpkiPem,
  passportProfilePayload,
  securityEventPayload,
  signSecurityPayload
} from "../../sdk/typescript/dist/index.js";

if (!globalThis.crypto) globalThis.crypto = webcrypto;

function pemFromSpki(bytes) {
  const base64 = Buffer.from(bytes).toString("base64").match(/.{1,64}/g).join("\n");
  return `-----BEGIN PUBLIC KEY-----\n${base64}\n-----END PUBLIC KEY-----`;
}

test("security SDK derives Passport ID and signs canonical profile payload", async () => {
  const keys = await crypto.subtle.generateKey({ name: "Ed25519" }, true, ["sign", "verify"]);
  const publicKey = pemFromSpki(await crypto.subtle.exportKey("spki", keys.publicKey));
  const profile = {
    public_key: publicKey,
    marketplace_agent_id: "agt_example",
    identity_ref: "https://agent.example/.well-known/agent-card.json",
    payment_endpoint: null,
    payment_methods: [],
    issued_at: "2026-09-04T08:00:00.000Z"
  };
  const passportId = await passportIdFromSpkiPem(publicKey);
  const payload = await passportProfilePayload(profile);
  assert.equal(payload.passport_id, passportId);
  assert.equal(payload.domain, "accordtrace.passport.profile.v1");
  const signature = await signSecurityPayload(keys.privateKey, payload);
  const normalized = signature.replace(/-/g, "+").replace(/_/g, "/");
  const padded = normalized + "=".repeat((4 - normalized.length % 4) % 4);
  const valid = await crypto.subtle.verify(
    "Ed25519",
    keys.publicKey,
    Buffer.from(padded, "base64"),
    new TextEncoder().encode(canonicalize(payload))
  );
  assert.equal(valid, true);
});

test("security SDK domain-separates signed events", () => {
  const payload = securityEventPayload({
    passport_id: "agtp_deadbeef",
    event_id: "evt_123",
    type: "network_policy_violation",
    severity: 65,
    metadata: { destination: "blocked.example" },
    observed_at: "2026-09-04T08:00:00.000Z"
  });
  assert.equal(payload.domain, "accordtrace.security.event.v1");
  assert.equal(payload.source, "self");
  assert.equal(payload.evidence_digest, null);
  assert.equal(payload.proof_id, null);
});
