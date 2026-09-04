import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const source = await readFile(new URL("../src/attestor-safety.js", import.meta.url), "utf8");
const identity = await readFile(new URL("../src/identity.js", import.meta.url), "utf8");
const migration = await readFile(new URL("../migrations/0010_attestor_safety.sql", import.meta.url), "utf8");

test("attestor safety has offline recovery, compromise and rotation domains", () => {
  for (const fragment of [
    "accordtrace.attestor.enroll.v1",
    "accordtrace.attestor.state.v1",
    "accordtrace.attestor.rotate.v1",
    "accordtrace.attestor.relationship.v1"
  ]) assert.match(source, new RegExp(fragment.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
});

test("compromised and revoked keys cannot reactivate", () => {
  assert.match(source, /compromised_key_cannot_reactivate/);
  assert.match(source, /revoked_key_cannot_reactivate/);
  assert.match(source, /replacement_passport_id/);
});

test("recovery key must be distinct and shared recovery is surfaced", () => {
  assert.match(source, /recovery_key_must_be_distinct/);
  assert.match(source, /shared_recovery_key_profiles/);
  assert.match(migration, /recovery_key_fingerprint/);
});

test("unsafe attestors stay auditable but do not qualify for confidence", () => {
  assert.match(identity, /LEFT JOIN attestor_safety_profiles/);
  assert.match(identity, /CASE WHEN s\.state='active' THEN 1 ELSE 0 END AS safety_qualified/);
  assert.match(identity, /unqualified_active_attestations/);
  assert.match(identity, /qualified_attestations/);
});

test("schema tracks explicit safety state and history", () => {
  assert.match(migration, /active','suspended','compromised','revoked/);
  assert.match(migration, /attestor_state_events/);
  assert.match(migration, /attestor_relationship_attestations/);
  assert.match(migration, /CHECK \(attestor_passport_id <> subject_passport_id\)/);
});
