import assert from "node:assert/strict";
import { baseUrl, createEvidence, createProof, printResult, requestJson } from "./lib.mjs";

const evidence = createEvidence("a2a-example");
const proof = await createProof(evidence, "a2a-example");
const response = await requestJson(`${baseUrl}/a2a`, {
  method: "POST",
  headers: { "content-type": "application/json", "A2A-Version": "1.0" },
  body: JSON.stringify({
    jsonrpc: "2.0",
    id: crypto.randomUUID(),
    method: "SendMessage",
    params: {
      message: {
        role: "ROLE_USER",
        messageId: crypto.randomUUID(),
        parts: [{
          data: { action: "verify_proof", arguments: { proof_id: proof.proof_id, data: evidence } },
          mediaType: "application/json"
        }]
      }
    }
  })
});
const verification = response.result?.task?.artifacts?.[0]?.parts?.[0]?.data;

assert.equal(verification?.valid, true);
assert.equal(verification?.hash_match, true);
printResult({
  interface: "A2A 1.0 JSON-RPC",
  service: `${baseUrl}/a2a`,
  proof_id: proof.proof_id,
  handoff_id: evidence.handoff_id,
  valid: verification.valid,
  hash_match: verification.hash_match
});
