import { createProof, getProof, hashData, verifyProof, ProofError } from "./proofs.js";

const MCP_VERSION = "2026-07-28";
const MCP_VERSIONS = [MCP_VERSION, "2025-11-25", "2025-06-18"];

export async function handleInteroperability(request, env, url = new URL(request.url)) {
  if (request.method === "GET" && (url.pathname === "/.well-known/agent-card.json" || url.pathname === "/.well-known/agent.json")) {
    const assetUrl = new URL("/.well-known/agent.json", request.url);
    const response = await env.ASSETS.fetch(new Request(assetUrl, { method: "GET" }));
    if (!response.ok) return json({ error: "agent_card_unavailable" }, 503);
    const card = await response.json();
    return json(card, 200, { "cache-control": "public, max-age=300" });
  }

  if (url.pathname === "/a2a") {
    if (request.method === "GET") return json({ service: "Accord Trace", protocol: "A2A", protocol_version: "1.0", binding: "JSONRPC", status: "ready" });
    if (request.method === "POST") return handleA2A(request, env);
  }

  if (url.pathname === "/mcp") {
    if (request.method === "GET") return json({ service: "Accord Trace", protocol: "MCP", transport: "streamable-http", protocol_version: MCP_VERSION, status: "ready" });
    if (request.method === "POST") return handleMcp(request, env);
  }

  return null;
}

async function handleA2A(request, env) {
  const body = await readJson(request);
  const method = String(body?.method ?? "");
  if (!/^(SendMessage|message\/send)$/i.test(method)) return null;
  const message = body?.params?.message ?? body?.message;
  const instruction = extractAction(message);
  if (!instruction) return rpcError(body?.id ?? null, -32602, "A2A message must include an AccordTrace action and arguments");
  try {
    const result = await executeAction(env, instruction.action, instruction.arguments);
    return json({
      jsonrpc: "2.0",
      id: body?.id ?? null,
      result: {
        task: {
          id: `task_${crypto.randomUUID()}`,
          status: { state: "TASK_STATE_COMPLETED", timestamp: new Date().toISOString() },
          artifacts: [{ artifactId: `artifact_${crypto.randomUUID()}`, name: "AccordTraceResult", parts: [{ data: result, mediaType: "application/json" }] }]
        }
      }
    });
  } catch (error) {
    return actionError(body?.id ?? null, error);
  }
}

async function handleMcp(request, env) {
  const body = await readJson(request);
  const id = body?.id ?? null;
  const method = String(body?.method ?? "");
  try {
    if (method === "server/discover") {
      return rpcResult(id, { name: "accord-trace", version: "0.2.1", supportedVersions: MCP_VERSIONS, transport: "streamable-http", capabilities: { tools: {} } });
    }
    if (method === "initialize") {
      const requested = String(body?.params?.protocolVersion ?? MCP_VERSION);
      const protocolVersion = MCP_VERSIONS.includes(requested) ? requested : MCP_VERSION;
      return rpcResult(id, { protocolVersion, capabilities: { tools: {} }, serverInfo: { name: "accord-trace", version: "0.2.1" } });
    }
    if (method === "notifications/initialized") return new Response(null, { status: 202 });
    if (method === "tools/list") return rpcResult(id, { tools: mcpTools() });
    if (method === "tools/call") {
      const name = String(body?.params?.name ?? "");
      const args = body?.params?.arguments ?? {};
      const action = MCP_ACTIONS[name];
      if (!action) return rpcError(id, -32601, `Unknown AccordTrace tool: ${name}`);
      const result = await executeAction(env, action, args);
      return rpcResult(id, { content: [{ type: "text", text: JSON.stringify(result) }], structuredContent: result, isError: false });
    }
    return rpcError(id, -32601, `Method not found: ${method}`);
  } catch (error) {
    return actionError(id, error);
  }
}

const MCP_ACTIONS = {
  accord_trace_create_proof: "notarize_evidence",
  accord_trace_verify: "verify_proof",
  accord_trace_get_proof: "get_proof",
  accord_trace_hash: "hash_content"
};

function mcpTools() {
  return [
    {
      name: "accord_trace_create_proof",
      description: "Create an AccordTrace issuer-signed, hash-bound proof without storing the submitted content.",
      inputSchema: { type: "object", required: ["data"], properties: { data: {}, metadata: { type: ["object", "null"] } } }
    },
    {
      name: "accord_trace_verify",
      description: "Verify an AccordTrace proof issuer signature and optionally compare supplied data or a hash.",
      inputSchema: { type: "object", required: ["proof_id"], properties: { proof_id: { type: "string" }, data: {}, hash: { type: "string" } } }
    },
    {
      name: "accord_trace_get_proof",
      description: "Retrieve public non-secret AccordTrace proof metadata by proof ID.",
      inputSchema: { type: "object", required: ["proof_id"], properties: { proof_id: { type: "string" } } }
    },
    {
      name: "accord_trace_hash",
      description: "Compute AccordTrace canonical SHA-256 for JSON-compatible data without creating a proof.",
      inputSchema: { type: "object", required: ["data"], properties: { data: {} } }
    }
  ];
}

async function executeAction(env, action, args = {}) {
  switch (action) {
    case "notarize_evidence":
    case "create_proof":
      if (!Object.prototype.hasOwnProperty.call(args, "data")) throw new ProofError("data is required");
      return createProof(env, args.data, args.metadata ?? null);
    case "verify_proof":
      return verifyProof(env, args);
    case "get_proof":
      return getProof(env, String(args?.proof_id ?? ""));
    case "hash_content":
      if (!Object.prototype.hasOwnProperty.call(args, "data")) throw new ProofError("data is required");
      return { hash: await hashData(args.data), algorithm: "SHA-256", canonicalization: "accordtrace-json-v1" };
    default:
      throw new ProofError(`Unsupported AccordTrace action: ${action}`, 400, "unsupported_action");
  }
}

function extractAction(message) {
  for (const part of message?.parts ?? []) {
    const data = part?.data;
    if (data && typeof data === "object" && typeof data.action === "string") return { action: data.action, arguments: data.arguments ?? {} };
    if (data?.accordtrace && typeof data.accordtrace.action === "string") return { action: data.accordtrace.action, arguments: data.accordtrace.arguments ?? {} };
  }
  return null;
}

async function readJson(request) {
  const text = await request.text();
  if (new TextEncoder().encode(text).byteLength > 1_048_576) throw new ProofError("Request body exceeds 1 MiB", 413);
  try { return JSON.parse(text); } catch { throw new ProofError("Request body must be valid JSON"); }
}

function actionError(id, error) {
  const status = error instanceof ProofError ? error.status : 500;
  const code = error instanceof ProofError ? -32602 : -32603;
  const response = rpcError(id, code, error instanceof Error ? error.message : "Internal error");
  return new Response(response.body, { status, headers: response.headers });
}

function rpcResult(id, result) { return json({ jsonrpc: "2.0", id, result }); }
function rpcError(id, code, message) { return json({ jsonrpc: "2.0", id, error: { code, message } }); }

function json(body, status = 200, extraHeaders = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store", ...extraHeaders }
  });
}
