import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const moduleSource = await readFile(new URL("../src/identity.js", import.meta.url), "utf8");
const migration = await readFile(new URL("../migrations/0009_identity_attestations.sql", import.meta.url), "utf8");

test("identity API exposes third-party attestations, revocation and evidence", () => {
  for (const fragment of [
    "/api/v1/identity/capabilities",
    "/api/v1/identity/attestations",
    "/api/v1/identity/attestations/revoke"
  ]) assert.match(moduleSource, new RegExp(fragment.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  assert.match(moduleSource, /identity\\\/passports\\\/\(\[\^\/\]\+\)\\\/evidence/);
});

test("identity claims are domain-separated Ed25519 signatures", () => {
  assert.match(moduleSource, /accordtrace\.identity\.attestation\.v1/);
  assert.match(moduleSource, /accordtrace\.identity\.attestation\.revoke\.v1/);
  assert.match(moduleSource, /verifyEd25519\(attestor\.public_key/);
});

test("self-attestation and indefinite claims are rejected", () => {
  assert.match(moduleSource, /self_attestation_not_allowed/);
  assert.match(moduleSource, /365\*24\*60\*60\*1000/);
  assert.match(migration, /CHECK \(attestor_passport_id <> subject_passport_id\)/);
});

test("identity evidence stays unscored until anti-Sybil analysis exists", () => {
  assert.match(moduleSource, /trust_score:null/);
  assert.match(moduleSource, /anti-Sybil graph analysis/);
  assert.match(moduleSource, /distinct_attestors/);
});

test("schema constrains attestation categories and passport relations", () => {
  for (const type of ["verified_domain","organization","software_publisher","security_evaluator","payment_rail_identity"]) assert.match(migration, new RegExp(type));
  assert.match(migration, /REFERENCES agent_passports\(id\)/);
});
