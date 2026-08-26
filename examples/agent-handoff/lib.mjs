import assert from "node:assert/strict";

export const baseUrl = String(process.env.ACCORD_TRACE_URL || "https://accordtrace.notary-labs.workers.dev").replace(/\/$/, "");

export function createEvidence(client) {
  return {
    event: "agent.handoff",
    handoff_id: crypto.randomUUID(),
    from: "agent-a",
    to: "agent-b",
    artifact: {
      name: "release-manifest.json",
      sha256: "sha256:replace-with-the-artifact-digest"
    },
    client
  };
}

export async function requestJson(url, init = {}, expectedStatuses = [200]) {
  const response = await fetch(url, init);
  const text = await response.text();
  assert.ok(expectedStatuses.includes(response.status), `${url}: HTTP ${response.status}: ${text.slice(0, 300)}`);
  return JSON.parse(text);
}

export async function createProof(evidence, client) {
  const proof = await requestJson(`${baseUrl}/api/v1/proofs`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ data: evidence, metadata: { workflow: "agent-handoff", client } })
  }, [201]);
  assert.match(proof.proof_id, /^atp_/);
  return proof;
}

export async function verifyRest(proofId, evidence) {
  const verification = await requestJson(`${baseUrl}/api/v1/verify`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ proof_id: proofId, data: evidence })
  });
  assert.equal(verification.valid, true);
  assert.equal(verification.hash_match, true);
  return verification;
}

export async function callMcp(name, args, id = crypto.randomUUID()) {
  const method = "tools/call";
  return requestJson(`${baseUrl}/mcp`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "MCP-Protocol-Version": "2026-07-28",
      "Mcp-Method": method,
      "Mcp-Name": name
    },
    body: JSON.stringify({
      jsonrpc: "2.0",
      id,
      method,
      params: {
        name,
        arguments: args,
        _meta: {
          "io.modelcontextprotocol/protocolVersion": "2026-07-28",
          "io.modelcontextprotocol/clientInfo": { name: "accord-trace-handoff-example", version: "1.0.0" },
          "io.modelcontextprotocol/clientCapabilities": {}
        }
      }
    })
  });
}

export function printResult(result) {
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
}
