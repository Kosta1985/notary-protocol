import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import test from "node:test";

test("standalone MCP adapter negotiates a legacy revision and lists tools", async (context) => {
  const child = spawn(process.execPath, ["adapters/mcp/server.js"], { stdio: ["pipe", "pipe", "pipe"] });
  context.after(() => child.kill());
  const lines = [];
  child.stdout.setEncoding("utf8");
  child.stdout.on("data", (chunk) => lines.push(...chunk.trim().split("\n")));
  child.stdin.write(`${JSON.stringify({ jsonrpc: "2.0", id: 1, method: "initialize", params: { protocolVersion: "2025-11-25" } })}\n`);
  child.stdin.write(`${JSON.stringify({ jsonrpc: "2.0", id: 2, method: "tools/list", params: {} })}\n`);

  await waitFor(() => lines.length >= 2);
  const responses = lines.map((line) => JSON.parse(line));
  assert.equal(responses[0].result.protocolVersion, "2025-11-25");
  assert.deepEqual(responses[1].result.tools.map((tool) => tool.name), ["notary_verify", "notary_get_receipt"]);
});

async function waitFor(predicate) {
  const deadline = Date.now() + 2_000;
  while (!predicate()) {
    if (Date.now() > deadline) throw new Error("Timed out waiting for MCP adapter");
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
}
