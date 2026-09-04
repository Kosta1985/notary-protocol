import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const moduleSource = await readFile(new URL("../src/security.js", import.meta.url), "utf8");
const migrationSource = await readFile(new URL("../migrations/0005_agent_security.sql", import.meta.url), "utf8");

test("security module exposes passport, events and passive canary routes", () => {
  for (const fragment of [
    "/api/v1/security/capabilities",
    "/api/v1/security/passports",
    "/api/v1/security/events",
    "/api/v1/security/canaries",
    "/api/v1/security/canaries/check"
  ]) assert.match(moduleSource, new RegExp(fragment.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
});

test("unverified reports cannot change trust score", () => {
  assert.match(moduleSource, /const trustDelta = verified \? policy\.delta : 0/);
  assert.match(moduleSource, /Unverified reports never change score/);
});

test("proof-backed events bind to AccordTrace receipts", () => {
  assert.match(moduleSource, /SELECT receipt FROM receipts WHERE id=\?1/);
  assert.match(moduleSource, /receipt\.evidenceDigest !== evidenceDigest/);
  assert.match(moduleSource, /proof_evidence_mismatch/);
});

test("canaries are passive and do not record source IP", () => {
  assert.match(moduleSource, /endpoint records no source IP/);
  assert.match(moduleSource, /'canary_touch',90,0,0,'isolate'/);
});

test("migration creates passport, event and canary tables", () => {
  for (const table of ["agent_passports", "security_events", "security_canaries"]) {
    assert.match(migrationSource, new RegExp(`CREATE TABLE IF NOT EXISTS ${table}`));
  }
});
