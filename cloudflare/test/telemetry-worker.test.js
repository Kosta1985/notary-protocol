import assert from "node:assert/strict";
import test from "node:test";
import { classifyRequest } from "../src/telemetry-worker.js";

test("health, discovery and stats probes are excluded", () => {
  for (const path of ["/health", "/api/v1/stats", "/v1/stats", "/.well-known/agent-card.json", "/openapi.json"]) {
    const result = classifyRequest(new Request(`https://example.test${path}`));
    assert.equal(result.track, false, path);
  }
});

test("REST verification is classified", () => {
  const result = classifyRequest(new Request("https://example.test/v1/verify", { method: "POST" }));
  assert.deepEqual(result, { track: true, internal: false, protocol: "rest", action: "verification" });
});

test("MCP and A2A calls are separated", () => {
  const mcp = classifyRequest(new Request("https://example.test/mcp", { method: "POST" }));
  const a2a = classifyRequest(new Request("https://example.test/a2a", { method: "POST" }));
  assert.equal(mcp.protocol, "mcp");
  assert.equal(mcp.action, "mcp_call");
  assert.equal(a2a.protocol, "a2a");
  assert.equal(a2a.action, "a2a_call");
});

test("monitor traffic is classified internal", () => {
  const result = classifyRequest(new Request("https://example.test/v1/verify", {
    method: "POST",
    headers: { "x-notary-monitor": "live-smoke" }
  }));
  assert.equal(result.track, true);
  assert.equal(result.internal, true);
});

test("static GET pages do not inflate API usage", () => {
  const result = classifyRequest(new Request("https://example.test/"));
  assert.equal(result.track, false);
});
