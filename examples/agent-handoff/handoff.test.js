import assert from "node:assert/strict";
import test from "node:test";
import { createViaRest, evidence, retrieveViaA2A, verifyViaMcp } from "./handoff.mjs";

function mockFetch(calls) {
  return async (url, options) => {
    calls.push({ url: String(url), body: JSON.parse(options.body) });
    const body = String(url).endsWith("/api/v1/proofs")
      ? { proof_id: "atp_test" }
      : { jsonrpc: "2.0", id: 1, result: { ok: true } };
    return { ok: true, status: 200, json: async () => body };
  };
}

test("handoff uses the production REST, MCP, and A2A contracts", async () => {
  const calls = [];
  const fetcher = mockFetch(calls);
  const data = evidence();

  const created = await createViaRest(data, fetcher);
  await verifyViaMcp(created.proof_id, data, fetcher);
  await retrieveViaA2A(created.proof_id, fetcher);

  assert.equal(created.proof_id, "atp_test");
  assert.deepEqual(calls.map((call) => new URL(call.url).pathname), [
    "/api/v1/proofs", "/mcp", "/mcp", "/a2a"
  ]);
  assert.equal(calls[2].body.method, "tools/call");
  assert.equal(calls[2].body.params.name, "verify_proof");
  assert.equal(calls[3].body.method, "message/send");
  assert.equal(calls[3].body.params.message.parts[0].data.action, "get_proof");
});
