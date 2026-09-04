import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const moduleSource = await readFile(new URL("../src/trust.js", import.meta.url), "utf8");
const migrationSource = await readFile(new URL("../migrations/0006_trust_attestations.sql", import.meta.url), "utf8");

test("trust module exposes signed task payment and reputation routes", () => {
  for (const fragment of [
    "/api/v1/trust/capabilities",
    "/api/v1/trust/task-attestations",
    "/api/v1/trust/payment-attestations",
    "/reputation"
  ]) assert.match(moduleSource, new RegExp(fragment.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
});

test("task evidence is proof-bound and bilateral", () => {
  assert.match(moduleSource, /proof_evidence_mismatch/);
  assert.match(moduleSource, /bilateral_accepted/);
  assert.match(moduleSource, /counterparty must use a different Passport/);
});

test("payment layer never claims custody or settlement truth", () => {
  assert.match(moduleSource, /custody: "none"/);
  assert.match(moduleSource, /not_independently_verified/);
  assert.match(moduleSource, /does not custody, transfer, freeze, redirect, or seize funds/);
});

test("reputation remains unscored and discloses Sybil risk", () => {
  assert.match(moduleSource, /trust_score: null/);
  assert.match(moduleSource, /Sybil risk/);
  assert.match(moduleSource, /evidence_based_unscored/);
});

test("migration binds attestations to passports and tasks", () => {
  assert.match(migrationSource, /REFERENCES agent_passports/);
  assert.match(migrationSource, /REFERENCES marketplace_tasks/);
});
