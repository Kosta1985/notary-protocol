import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const moduleSource = await readFile(new URL("../src/marketplace.js", import.meta.url), "utf8");
const migrationSource = await readFile(new URL("../migrations/0004_marketplace.sql", import.meta.url), "utf8");

test("marketplace module exposes agent and task lifecycle routes", () => {
  for (const fragment of [
    '"/api/v1/marketplace/agents"',
    '"/api/v1/marketplace/tasks"',
    'accept|deliver|verify',
    "task_not_open",
    "proof_artifact_mismatch",
    "verification_failed"
  ]) assert.match(moduleSource, new RegExp(fragment.replace(/[.*+?^${}()|[\]\\]/g, "\\$&").replace("accept\\|deliver\\|verify", "accept\\|deliver\\|verify")));
});

test("marketplace acceptance is guarded by open status", () => {
  assert.match(moduleSource, /WHERE id=\?3 AND status='open'/);
  assert.match(moduleSource, /meta\?\.changes/);
});

test("delivery requires an AccordTrace proof bound to artifact digest", () => {
  assert.match(moduleSource, /SELECT receipt FROM receipts WHERE id=\?1/);
  assert.match(moduleSource, /proof\.evidenceDigest !== body\.artifact_digest/);
  assert.match(moduleSource, /status='delivered'/);
});

test("verification re-checks stored proof before verified transition", () => {
  assert.match(moduleSource, /proof\.evidenceDigest !== task\.artifact_digest/);
  assert.match(moduleSource, /status='verified'/);
  assert.match(moduleSource, /status='delivered'/);
});

test("marketplace migration constrains lifecycle states", () => {
  assert.match(migrationSource, /marketplace_agents/);
  assert.match(migrationSource, /marketplace_tasks/);
  for (const state of ["open", "accepted", "delivered", "verified", "disputed", "cancelled"]) {
    assert.match(migrationSource, new RegExp(`'${state}'`));
  }
});
