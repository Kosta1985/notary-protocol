import assert from "node:assert/strict";
import { baseUrl, callMcp, createEvidence, createProof, printResult } from "./lib.mjs";

const evidence = createEvidence("mcp-example");
const proof = await createProof(evidence, "mcp-example");
const response = await callMcp("accord_trace_verify", { proof_id: proof.proof_id, data: evidence });
const verification = response.result?.structuredContent;

assert.equal(verification?.valid, true);
assert.equal(verification?.hash_match, true);
printResult({
  interface: "MCP Streamable HTTP",
  service: `${baseUrl}/mcp`,
  proof_id: proof.proof_id,
  handoff_id: evidence.handoff_id,
  valid: verification.valid,
  hash_match: verification.hash_match
});
