import assert from "node:assert/strict";
import { baseUrl, createEvidence, createProof, printResult, requestJson } from "./lib.mjs";

assert.ok(process.env.OPENAI_API_KEY, "Set OPENAI_API_KEY before running this example");
const evidence = createEvidence("openai-responses-example");
const proof = await createProof(evidence, "openai-responses-example");
const response = await requestJson("https://api.openai.com/v1/responses", {
  method: "POST",
  headers: {
    authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
    "content-type": "application/json"
  },
  body: JSON.stringify({
    model: process.env.OPENAI_MODEL || "gpt-5",
    store: false,
    tools: [{
      type: "mcp",
      server_label: "accord_trace",
      server_url: `${baseUrl}/mcp`,
      allowed_tools: ["accord_trace_verify"],
      require_approval: "never"
    }],
    tool_choice: "required",
    input: `Use accord_trace_verify to verify this agent handoff. proof_id=${proof.proof_id} data=${JSON.stringify(evidence)}. Report only whether valid and hash_match are true.`
  })
}, [200]);

const toolCall = response.output?.find((item) => item.type === "mcp_call");
assert.equal(toolCall?.name, "accord_trace_verify");
assert.equal(toolCall?.error, null);
printResult({
  interface: "OpenAI Responses API with remote MCP",
  model: response.model,
  proof_id: proof.proof_id,
  handoff_id: evidence.handoff_id,
  mcp_tool: toolCall.name,
  response_id: response.id
});
