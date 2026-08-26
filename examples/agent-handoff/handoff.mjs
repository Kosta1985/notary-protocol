const BASE_URL = (process.env.ACCORD_TRACE_URL || "https://accordtrace.notary-labs.workers.dev").replace(/\/$/, "");

async function jsonRequest(url, options = {}, fetcher = fetch) {
  const response = await fetcher(url, {
    ...options,
    headers: { "content-type": "application/json", ...(options.headers || {}) }
  });
  const body = await response.json();
  if (!response.ok || body.error) throw new Error(`${url} failed: ${body.error?.message || body.message || response.status}`);
  return body;
}

export function evidence() {
  return {
    artifact: "release-manifest.json",
    sha256: "8d969eef6ecad3c29a3a629280e686cff8ca8e7cbebc99a3b4d5d3c2a86f9f4a",
    workflow: "rest-mcp-a2a-openai-claude"
  };
}

export async function createViaRest(data, fetcher = fetch) {
  return jsonRequest(`${BASE_URL}/api/v1/proofs`, {
    method: "POST",
    body: JSON.stringify({ data, metadata: { workflow: data.workflow, step: "rest-create" } })
  }, fetcher);
}

export async function callMcp(method, params, id, fetcher = fetch) {
  return jsonRequest(`${BASE_URL}/mcp`, {
    method: "POST",
    headers: {
      accept: "application/json, text/event-stream",
      "mcp-protocol-version": "2025-11-25"
    },
    body: JSON.stringify({ jsonrpc: "2.0", id, method, params })
  }, fetcher);
}

export async function verifyViaMcp(proofId, data, fetcher = fetch) {
  await callMcp("initialize", {
    protocolVersion: "2025-11-25",
    capabilities: {},
    clientInfo: { name: "accord-trace-handoff-example", version: "1.0.0" }
  }, 1, fetcher);
  return callMcp("tools/call", {
    name: "verify_proof",
    arguments: { proof_id: proofId, data }
  }, 2, fetcher);
}

export async function retrieveViaA2A(proofId, fetcher = fetch) {
  return jsonRequest(`${BASE_URL}/a2a`, {
    method: "POST",
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: "handoff-a2a-1",
      method: "message/send",
      params: {
        message: {
          role: "user",
          messageId: "handoff-message-1",
          parts: [{ kind: "data", data: { action: "get_proof", arguments: { proof_id: proofId } } }]
        }
      }
    })
  }, fetcher);
}

export async function reviewWithOpenAI(handoff, fetcher = fetch) {
  if (!process.env.OPENAI_API_KEY) return { skipped: true, reason: "OPENAI_API_KEY is not set" };
  return jsonRequest("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: { authorization: `Bearer ${process.env.OPENAI_API_KEY}` },
    body: JSON.stringify({
      model: process.env.OPENAI_MODEL || "gpt-5-mini",
      input: "Check whether this Accord Trace handoff contains a successful integrity verification. Do not infer truth or identity. Return a short decision and reasons.\n" + JSON.stringify(handoff)
    })
  }, fetcher);
}

export async function reviewWithClaude(openAIResult, receipt, fetcher = fetch) {
  if (!process.env.ANTHROPIC_API_KEY) return { skipped: true, reason: "ANTHROPIC_API_KEY is not set" };
  return jsonRequest("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "x-api-key": process.env.ANTHROPIC_API_KEY,
      "anthropic-version": "2023-06-01"
    },
    body: JSON.stringify({
      model: process.env.ANTHROPIC_MODEL || "claude-sonnet-4-5",
      max_tokens: 500,
      messages: [{
        role: "user",
        content: "Independently review the prior agent decision against the Accord Trace receipt. Treat the receipt only as integrity and recorded-time evidence.\n" + JSON.stringify({ openAIResult, receipt })
      }]
    })
  }, fetcher);
}

export async function run(fetcher = fetch) {
  const data = evidence();
  const created = await createViaRest(data, fetcher);
  const proofId = created.proof_id;
  if (!proofId) throw new Error("REST response did not include proof_id");
  const mcpVerification = await verifyViaMcp(proofId, data, fetcher);
  const a2aReceipt = await retrieveViaA2A(proofId, fetcher);
  const openAIReview = await reviewWithOpenAI({ proofId, mcpVerification, a2aReceipt }, fetcher);
  const claudeReview = await reviewWithClaude(openAIReview, a2aReceipt, fetcher);
  return { proofId, created, mcpVerification, a2aReceipt, openAIReview, claudeReview };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  run().then((result) => console.log(JSON.stringify(result, null, 2))).catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
}
