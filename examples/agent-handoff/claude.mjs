import assert from "node:assert/strict";
import { baseUrl, createEvidence, createProof, printResult, requestJson } from "./lib.mjs";

assert.ok(process.env.ANTHROPIC_API_KEY, "Set ANTHROPIC_API_KEY before running this example");
const evidence = createEvidence("claude-messages-example");
const proof = await createProof(evidence, "claude-messages-example");
const response = await requestJson("https://api.anthropic.com/v1/messages", {
  method: "POST",
  headers: {
    "x-api-key": process.env.ANTHROPIC_API_KEY,
    "anthropic-version": "2023-06-01",
    "anthropic-beta": "mcp-client-2025-11-20",
    "content-type": "application/json"
  },
  body: JSON.stringify({
    model: process.env.ANTHROPIC_MODEL || "claude-opus-5",
    max_tokens: 512,
    mcp_servers: [{ type: "url", url: `${baseUrl}/mcp`, name: "accord-trace" }],
    tools: [{
      type: "mcp_toolset",
      mcp_server_name: "accord-trace",
      default_config: { enabled: false },
      configs: { accord_trace_verify: { enabled: true } }
    }],
    messages: [{
      role: "user",
      content: `Use accord_trace_verify to verify this agent handoff. proof_id=${proof.proof_id} data=${JSON.stringify(evidence)}. Report only whether valid and hash_match are true.`
    }]
  })
}, [200]);

const toolUse = response.content?.find((block) => block.type === "mcp_tool_use");
const toolResult = response.content?.find((block) => block.type === "mcp_tool_result");
assert.equal(toolUse?.name, "accord_trace_verify");
assert.equal(toolResult?.is_error, false);
printResult({
  interface: "Claude Messages API with MCP connector",
  model: response.model,
  proof_id: proof.proof_id,
  handoff_id: evidence.handoff_id,
  mcp_tool: toolUse.name,
  response_id: response.id
});
