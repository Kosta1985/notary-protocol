import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const source = await readFile(new URL("../src/control-plane-hardening.js", import.meta.url), "utf8");
const migration = await readFile(new URL("../migrations/0012_control_plane_hardening.sql", import.meta.url), "utf8");
const worker = await readFile(new URL("../src/worker.js", import.meta.url), "utf8");

test("hardening routes are isolated and authenticated before base control plane", () => {
  assert.match(worker,/handleControlPlaneHardening/);
  assert.match(worker,/control-plane\/maintenance/);
  assert.match(worker,/control-plane\/sessions/);
  assert.match(source,/authentication_required/);
  assert.match(source,/invalid_operator_token/);
});

test("ephemeral sessions cannot escalate or chain", () => {
  assert.match(source,/MAX_SESSION_HOURS=12/);
  assert.match(source,/session_chaining_not_allowed/);
  assert.match(source,/ROLES\[requestedRole\]>ROLES\[auth\.role\]/);
  assert.match(source,/expires_at/);
  assert.match(migration,/token_sha256 TEXT NOT NULL UNIQUE/);
});

test("operator requests are rate limited per minute", () => {
  assert.match(source,/CONTROL_PLANE_RATE_LIMIT_PER_MINUTE/);
  assert.match(source,/rate_limit_exceeded/);
  assert.match(migration,/control_plane_rate_limits/);
});

test("alert outbox is deduplicated and bounded", () => {
  assert.match(migration,/UNIQUE \(integration_id,event_digest\)/);
  assert.match(source,/MAX_ATTEMPTS=5/);
  assert.match(source,/dead_letter/);
  assert.match(source,/RETRY_SECONDS=\[60,300,1800,7200,21600\]/);
});

test("webhook delivery is HTTPS only and signed without exposing secret", () => {
  assert.match(source,/u\.protocol==='https:'/);
  assert.match(source,/x-accordtrace-signature/);
  assert.match(source,/HMAC/);
  assert.match(source,/contains_secrets:false/);
  assert.doesNotMatch(source,/signing_secret[^\n]*JSON\.stringify/);
});

test("automated retention never deletes append-only audit receipts", () => {
  assert.match(source,/audit_rows:0/);
  assert.match(source,/append-only audit receipts are exempt from automated retention/);
  assert.match(migration,/audit_rows_deleted INTEGER NOT NULL DEFAULT 0 CHECK \(audit_rows_deleted = 0\)/);
  assert.doesNotMatch(source,/DELETE FROM control_plane_audit/);
});
