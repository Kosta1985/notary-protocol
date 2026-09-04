import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const moduleSource = await readFile(new URL("../src/security.js", import.meta.url), "utf8");
const migrationSource = await readFile(new URL("../migrations/0005_agent_security.sql", import.meta.url), "utf8");

test("passport ownership is Ed25519 signed and key-derived", () => {
  assert.match(moduleSource, /passportIdFor/);
  assert.match(moduleSource, /verifyEd25519/);
  assert.match(moduleSource, /profile signature is not newer/);
});

test("no misleading public trust score is issued", () => {
  assert.match(moduleSource, /trust_score: null/);
  assert.match(moduleSource, /provisional_unscored/);
  assert.match(moduleSource, /claimed_not_verified/);
});

test("security events require signed passport control", () => {
  assert.match(moduleSource, /accordtrace\.security\.event\.v1/);
  assert.match(moduleSource, /signature verification failed/);
  assert.match(moduleSource, /reputation_effect: "none"/);
});

test("canary creation requires passport signature and touch stores no IP", () => {
  assert.match(moduleSource, /accordtrace\.security\.canary\.create\.v1/);
  assert.match(moduleSource, /endpoint records no source IP/);
  assert.doesNotMatch(moduleSource, /request\.headers\.get\(["']cf-connecting-ip/);
});

test("schema has passport foreign keys", () => {
  assert.match(migrationSource, /FOREIGN KEY \(passport_id\) REFERENCES agent_passports\(id\)/);
});
