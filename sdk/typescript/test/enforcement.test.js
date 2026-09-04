import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { createProtectedFetch, createProtectedMcpCallTool, EnforcementError } from "../dist/enforcement.js";

const source = await readFile(new URL("../src/enforcement.ts", import.meta.url), "utf8");

const signer = {
  passportId: "pass_test",
  async sign() { return "sig"; }
};

function jsonResponse(body, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
}

test("protected fetch is fail-closed when gateway is unavailable", async () => {
  let targetCalls = 0;
  const wrapped = createProtectedFetch({
    accordTraceBaseUrl: "https://accord.example",
    leaseId: "lease_1",
    signer,
    fetchImpl: async (input) => {
      const url = String(input instanceof Request ? input.url : input);
      if (url.startsWith("https://accord.example/")) return jsonResponse({ message: "down" }, 503);
      targetCalls += 1;
      return new Response("ok");
    }
  });
  await assert.rejects(() => wrapped("https://api.example/data"), (error) => error instanceof EnforcementError && error.code === "gateway_unavailable");
  assert.equal(targetCalls, 0);
});

test("agent supplied credential headers are rejected before authorization", async () => {
  let gatewayCalls = 0;
  const wrapped = createProtectedFetch({
    accordTraceBaseUrl: "https://accord.example",
    leaseId: "lease_1",
    signer,
    fetchImpl: async () => { gatewayCalls += 1; return jsonResponse({}); }
  });
  await assert.rejects(() => wrapped("https://api.example/data", { headers: { authorization: "Bearer agent-secret" } }), (error) => error instanceof EnforcementError && error.code === "agent_supplied_credential");
  assert.equal(gatewayCalls, 0);
});

test("protected fetch checks lease status immediately before target execution", async () => {
  const calls = [];
  const wrapped = createProtectedFetch({
    accordTraceBaseUrl: "https://accord.example",
    leaseId: "lease_1",
    signer,
    credentialBroker: async () => ({ authorization: "Bearer broker-only" }),
    fetchImpl: async (input) => {
      const req = input instanceof Request ? input : new Request(input);
      calls.push(req.url);
      if (req.url.endsWith("/api/v1/gateway/authorize")) return jsonResponse({ decision: { allowed: true, reason: "authorized", decided_at: new Date().toISOString() } });
      if (req.url.endsWith("/api/v1/gateway/leases/status")) return jsonResponse({ lease: { status: "active", expires_at: new Date(Date.now() + 60000).toISOString() } });
      assert.equal(req.headers.get("authorization"), "Bearer broker-only");
      return new Response("ok");
    }
  });
  const response = await wrapped("https://api.example/data");
  assert.equal(await response.text(), "ok");
  assert.match(calls[0], /authorize$/);
  assert.match(calls[1], /leases\/status$/);
  assert.equal(calls[2], "https://api.example/data");
});

test("stale gateway decisions are rejected", async () => {
  const wrapped = createProtectedFetch({
    accordTraceBaseUrl: "https://accord.example",
    leaseId: "lease_1",
    signer,
    maxDecisionAgeMs: 500,
    fetchImpl: async (input) => {
      const url = String(input instanceof Request ? input.url : input);
      if (url.endsWith("/authorize")) return jsonResponse({ decision: { allowed: true, reason: "authorized", decided_at: new Date(Date.now() - 5000).toISOString() } });
      return new Response("unexpected");
    }
  });
  await assert.rejects(() => wrapped("https://api.example/data"), (error) => error instanceof EnforcementError && error.code === "stale_gateway_decision");
});

test("MCP wrapper maps server and tool names without sending tool arguments to gateway", async () => {
  let gatewayBody = "";
  let toolArgs;
  const wrapped = createProtectedMcpCallTool({
    accordTraceBaseUrl: "https://accord.example",
    leaseId: "lease_1",
    signer,
    serverId: "CRM Server",
    serverOrigin: "https://mcp.example/path",
    fetchImpl: async (input, init) => {
      const url = String(input instanceof Request ? input.url : input);
      if (url.endsWith("/authorize")) { gatewayBody = String(init?.body ?? ""); return jsonResponse({ decision: { allowed: true, reason: "authorized", decided_at: new Date().toISOString() } }); }
      if (url.endsWith("/leases/status")) return jsonResponse({ lease: { status: "active", expires_at: new Date(Date.now() + 60000).toISOString() } });
      return jsonResponse({});
    }
  }, async (_name, args) => { toolArgs = args; return { ok: true }; });
  const result = await wrapped("Create Contact", { email: "private@example.com" });
  assert.deepEqual(result, { ok: true });
  assert.deepEqual(toolArgs, { email: "private@example.com" });
  assert.match(gatewayBody, /mcp:crm-server:create-contact/);
  assert.doesNotMatch(gatewayBody, /private@example\.com/);
});

test("source explicitly documents owner-only fail-open and credential boundary", () => {
  assert.match(source, /failMode\?: "closed" \| "open"/);
  assert.match(source, /credentialBroker/);
  assert.match(source, /rejectSensitiveAgentHeaders/);
  assert.match(source, /assertLeaseStillActive/);
});
