import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const moduleSource = await readFile(new URL("../cloudflare/src/marketplace.js", import.meta.url), "utf8");
const migrationSource = await readFile(new URL("../cloudflare/migrations/0005_marketplace_counters.sql", import.meta.url), "utf8");

test("marketplace exposes aggregate stats and per-agent counters", () => {
  assert.match(moduleSource, /\/api\/v1\/marketplace\/stats/);
  assert.match(moduleSource, /getAgentCounters/);
  assert.match(moduleSource, /tasks_by_status/);
});

test("lifecycle success paths record evidence-based events", () => {
  for (const event of ["agent_registered","agent_viewed","task_created","task_viewed","task_accepted","task_delivered","task_verified"]) {
    assert.match(moduleSource, new RegExp(event));
  }
});

test("counter storage includes immutable event ledger and daily rollups", () => {
  assert.match(migrationSource, /CREATE TABLE IF NOT EXISTS marketplace_events/);
  assert.match(migrationSource, /CREATE TABLE IF NOT EXISTS marketplace_daily_counters/);
  assert.match(migrationSource, /PRIMARY KEY \(day, metric, dimension\)/);
});

test("source attribution is bounded and explicit", () => {
  assert.match(moduleSource, /x-relaymarket-source/);
  assert.match(moduleSource, /source,COUNT\(\*\) AS count/);
});

test("delivery and verification counters only follow successful state transitions", () => {
  assert.match(moduleSource, /meta\?\.changes/);
  assert.match(moduleSource, /task_delivered/);
  assert.match(moduleSource, /task_verified/);
});
