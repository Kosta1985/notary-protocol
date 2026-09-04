import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const moduleSource = await readFile(new URL("../src/gateway.js", import.meta.url), "utf8");
const migrationSource = await readFile(new URL("../migrations/0007_capability_gateway.sql", import.meta.url), "utf8");

test("gateway exposes least-privilege lease authorization and revoke routes", () => {
  for (const fragment of [
    "/api/v1/gateway/capabilities",
    "/api/v1/gateway/leases",
    "/api/v1/gateway/authorize",
    "/api/v1/gateway/leases/revoke",
    "/api/v1/gateway/leases/status"
  ]) assert.match(moduleSource, new RegExp(fragment.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
});

test("leases are signed by issuer and authorization requests by subject", () => {
  assert.match(moduleSource, /accordtrace\.gateway\.capability\.lease\.v1/);
  assert.match(moduleSource, /accordtrace\.gateway\.authorization\.request\.v1/);
  assert.match(moduleSource, /verifyEd25519\(issuer\.public_key/);
  assert.match(moduleSource, /verifyEd25519\(subject\.public_key/);
});

test("quota increment is conditional and replay requests are idempotent", () => {
  assert.match(moduleSource, /used_calls=used_calls\+1/);
  assert.match(moduleSource, /used_calls<max_calls/);
  assert.match(moduleSource, /request_id_conflict/);
  assert.match(moduleSource, /replayed: true/);
});

test("issuer has an explicit signed kill switch", () => {
  assert.match(moduleSource, /accordtrace\.gateway\.capability\.revoke\.v1/);
  assert.match(moduleSource, /kill_switch: "revoked"/);
  assert.match(moduleSource, /status='revoked'/);
});

test("gateway is a decision service and never requests credentials", () => {
  assert.match(moduleSource, /calling runtime, proxy, MCP host, API gateway/);
  assert.match(moduleSource, /never asks an agent to disclose API keys/);
});

test("migration binds leases requests and decisions to cryptographic Passports", () => {
  assert.match(migrationSource, /FOREIGN KEY \(issuer_passport_id\) REFERENCES agent_passports/);
  assert.match(migrationSource, /FOREIGN KEY \(subject_passport_id\) REFERENCES agent_passports/);
  assert.match(migrationSource, /FOREIGN KEY \(request_id\) REFERENCES gateway_requests/);
  assert.match(migrationSource, /request_id TEXT NOT NULL UNIQUE/);
});
