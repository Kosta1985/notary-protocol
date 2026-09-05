import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { recordUsage } from "../src/usage-analytics.js";

function fakeEnv({ fail = false } = {}) {
  const events = [];
  return {
    events,
    DB: {
      prepare(sql) {
        assert.match(sql, /analytics_daily/);
        return {
          bind(event) {
            return {
              async run() {
                if (fail) throw new Error("telemetry unavailable");
                events.push(event);
              }
            };
          }
        };
      }
    }
  };
}

test("records valid aggregate usage events", async () => {
  const env = fakeEnv();
  const recorded = await recordUsage(env, "proof_created", { request: new Request("https://example.test/api/v1/proofs") });
  assert.equal(recorded, true);
  assert.deepEqual(env.events, ["proof_created"]);
});

test("monitor and synthetic traffic are excluded", async () => {
  const env = fakeEnv();
  assert.equal(await recordUsage(env, "mcp_request", { request: new Request("https://example.test/mcp", { headers: { "x-notary-monitor": "live-smoke" } }) }), false);
  assert.equal(await recordUsage(env, "proof_created", { synthetic: true }), false);
  assert.deepEqual(env.events, []);
});

test("telemetry failure never interrupts service behavior", async () => {
  const env = fakeEnv({ fail: true });
  assert.equal(await recordUsage(env, "a2a_request"), false);
});

test("rejects arbitrary event names", async () => {
  const env = fakeEnv();
  assert.equal(await recordUsage(env, "DROP TABLE analytics_daily"), false);
  assert.deepEqual(env.events, []);
});

test("modern runtime wires real proof and protocol counters plus canonical stats alias", () => {
  const proofs = fs.readFileSync(new URL("../src/proofs.js", import.meta.url), "utf8");
  const interoperability = fs.readFileSync(new URL("../src/interoperability.js", import.meta.url), "utf8");
  const worker = fs.readFileSync(new URL("../src/worker-v2.js", import.meta.url), "utf8");
  const smoke = fs.readFileSync(new URL("../../scripts/live-agent-check.mjs", import.meta.url), "utf8");

  assert.match(proofs, /recordUsage\(env, "proof_created"/);
  assert.match(proofs, /"proof_verified"/);
  assert.match(proofs, /"proof_verification_failed"/);
  assert.match(proofs, /normalizedMetadata\?\.synthetic === true/);
  assert.match(interoperability, /recordUsage\(env, "a2a_request"/);
  assert.match(interoperability, /recordUsage\(env, "mcp_request"/);
  assert.match(interoperability, /recordUsage\(env, "mcp_tool_call"/);
  assert.match(worker, /url\.pathname === "\/api\/v1\/stats"/);
  assert.match(worker, /new URL\("\/v1\/stats"/);
  assert.match(smoke, /"x-notary-monitor": "live-smoke"/);
});
