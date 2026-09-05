import { readJsonBody, InputError } from './http-request.js';
import { createProof, getProof, hashData, verifyProof, ProofError } from "./proofs.js";
import { handleAffiliate } from "./affiliate.js";
import { handleAffiliateGrowth } from "./affiliate-growth.js";
import { handlePassportProduct } from "./passport-product.js";
import { passportSafeEnv } from "./passport-signer-readiness.js";
import { recordUsage } from "./usage-analytics.js";
import { walletCapabilities } from "./wallet-capabilities.js";

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
  const preflight = rpcPreflight(body);
  if (preflight) return preflight;
  const method = String(body?.method ?? "");
  if (!/^(SendMessage|message\/send)$/i.test(method)) return rpcError(body.id ?? null, -32601, "Method not found");
  const message = body?.params?.message ?? body?.message;
  let instruction;
  try { instruction = extractAction(message); }
  catch (error) { return actionError(body.id ?? null, error); }
  if (!instruction) return rpcError(body?.id ?? null, -32602, "A2A message must include an AccordTrace action and arguments");
  await recordUsage(env, "a2a_request", { request });
  try {
    const result = await executeAction(env, instruction.action, instruction.arguments, request);
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
  const preflight = rpcPreflight(body);
  if (preflight) return preflight;
  const id = body?.id ?? null;
  const method = String(body?.method ?? "");
  await recordUsage(env, "mcp_request", { request });
  try {
    if (method === "ping") return rpcResult(id, {});
    if (method === "server/discover") {
      return rpcResult(id, { name: "accord-trace", version: "0.2.1", supportedVersions: MCP_VERSIONS, transport: "streamable-http", capabilities: { tools: {} } });
    }
    if (method === "initialize") {
      const requested = body.params?.protocolVersion ?? MCP_VERSION;
      if (typeof requested !== 'string' || requested.length > 128) throw new ProofError("protocolVersion must be a bounded string");
      const protocolVersion = MCP_VERSIONS.includes(requested) ? requested : MCP_VERSION;
      return rpcResult(id, { protocolVersion, capabilities: { tools: {} }, serverInfo: { name: "accord-trace", version: "0.2.1" } });
    }
    if (method === "notifications/initialized") return new Response(null, { status: 202 });
    if (method === "tools/list") return rpcResult(id, { tools: mcpTools() });
    if (method === "tools/call") {
      const name = body.params?.name;
      if (typeof name !== 'string' || !/^[A-Za-z0-9_.-]{1,128}$/.test(name)) throw new ProofError("A valid tool name is required");
      const args = body.params?.arguments === undefined ? {} : body.params.arguments;
      if (!isObject(args)) throw new ProofError("Tool arguments must be a JSON object");
      const action = Object.hasOwn(MCP_ACTIONS, name) ? MCP_ACTIONS[name] : null;
      if (!action) return rpcError(id, -32601, `Unknown AccordTrace tool: ${name}`);
      await recordUsage(env, "mcp_tool_call", { request });
      const result = await executeAction(env, action, args, request);
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
  accord_trace_hash: "hash_content",
  accord_trace_network_capabilities: "network_capabilities",
  accord_trace_network_stats: "network_stats",
  accord_trace_passport_product_capabilities: "passport_product_capabilities",
  accord_trace_wallet_capabilities: "wallet_capabilities",
  accord_trace_resolve_referral: "resolve_referral"
};

function mcpTools() {
  return [
    {
      name: "accord_trace_create_proof",
      description: "Create an AccordTrace hash-bound service record. If issuer signing is configured, the proof also carries an Ed25519 issuer signature. Submitted content is not stored.",
      inputSchema: { type: "object", required: ["data"], properties: { data: {}, metadata: { type: ["object", "null"] } } }
    },
    {
      name: "accord_trace_verify",
      description: "Verify an AccordTrace recorded proof, optionally compare supplied data/hash, and verify an issuer signature when one is present.",
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
    },
    {
      name: "accord_trace_network_capabilities",
      description: "Read the live one-level AccordTrace Agent Affiliate Network policy, economics, anti-downline rules and payout activation status. Read-only; it does not enroll or attribute an agent.",
      inputSchema: { type: "object", additionalProperties: false }
    },
    {
      name: "accord_trace_network_stats",
      description: "Read aggregate live affiliate-network states, distinguishing generated invitations, attributions, qualified direct sales, earned commissions and paid commissions.",
      inputSchema: { type: "object", additionalProperties: false }
    },
    {
      name: "accord_trace_passport_product_capabilities",
      description: "Read the live Agent Passport Certificate product price and commercial readiness gates. Read-only; it never initiates checkout.",
      inputSchema: { type: "object", additionalProperties: false }
    },
    {
      name: "accord_trace_wallet_capabilities",
      description: "Read machine-facing Agent Wallet feature gates, Ed25519 signing contract, funded-balance policy, USDC representation and explicit no-credit/no-lending boundary. Read-only; it never creates a wallet or moves funds.",
      inputSchema: { type: "object", additionalProperties: false }
    },
    {
      name: "accord_trace_resolve_referral",
      description: "Resolve a direct AccordTrace referral code to its active public referral record and disclosure without reserving attribution or creating a sale.",
      inputSchema: { type: "object", required: ["referral_code"], additionalProperties: false, properties: { referral_code: { type: "string", minLength: 1, maxLength: 80 } } }
    }
  ];
}

async function executeAction(env, action, args = {}, request = null) {
  if (!isObject(args)) throw new ProofError("Action arguments must be a JSON object");
  if (typeof action !== 'string' || action.length > 128) throw new ProofError("A valid action name is required");
  if (['verify_proof', 'get_proof'].includes(action) && typeof args.proof_id !== 'string') throw new ProofError("proof_id must be a string");
  switch (action) {
    case "notarize_evidence":
    case "create_proof":
      if (!Object.prototype.hasOwnProperty.call(args, "data")) throw new ProofError("data is required");
      return createProof(env, args.data, args.metadata ?? null, request);
    case "verify_proof":
      return verifyProof(env, args, request);
    case "get_proof":
      return getProof(env, String(args?.proof_id ?? ""));
    case "hash_content":
      if (!Object.prototype.hasOwnProperty.call(args, "data")) throw new ProofError("data is required");
      return { hash: await hashData(args.data), algorithm: "SHA-256", canonicalization: "accordtrace-json-v1" };
    case "network_capabilities":
      return readExistingPublicApi(env, "/api/v1/network/capabilities");
    case "network_stats":
      return readExistingPublicApi(env, "/api/v1/network/stats");
    case "passport_product_capabilities":
      return readExistingPublicApi(await passportSafeEnv(env), "/api/v1/passport-product/capabilities");
    case "wallet_capabilities":
      return walletCapabilities(env);
    case "resolve_referral": {
      if (typeof args.referral_code !== 'string' || args.referral_code.length > 80) throw new ProofError("referral_code must be a bounded string");
      const referralCode = args.referral_code.trim();
      if (!referralCode) throw new ProofError("referral_code is required");
      return readExistingPublicApi(env, `/api/v1/network/referrals/${encodeURIComponent(referralCode)}`);
    }
    default:
      throw new ProofError(`Unsupported AccordTrace action: ${action}`, 400, "unsupported_action");
  }
}

async function readExistingPublicApi(env, pathname) {
  const request = new Request(`https://accordtrace.internal${pathname}`, { method: "GET" });
  const url = new URL(request.url);
  let response = await handleAffiliateGrowth(request, env, url);
  if (!response) response = await handleAffiliate(request, env, url);
  if (!response && pathname.startsWith("/api/v1/passport-product/")) response = await handlePassportProduct(request, env, url);
  if (!response) throw new ProofError("AccordTrace public capability route is unavailable", 503, "capability_route_unavailable");
  let body;
  try { body = await response.json(); } catch { throw new ProofError("AccordTrace public capability route returned invalid JSON", 502, "capability_route_invalid"); }
  if (!response.ok) throw new ProofError(String(body?.error || body?.message || "AccordTrace public capability request failed"), response.status, String(body?.error || "capability_route_error"));
  return body;
}

function extractAction(message) {
  if (!isObject(message) || !Array.isArray(message.parts) || message.parts.length > 128) {
    throw new ProofError("A2A message must contain an array of at most 128 parts");
  }
  for (const part of message.parts) {
    if (!isObject(part)) throw new ProofError("A2A message parts must be objects");
    const data = part?.data;
    if (data && typeof data === "object" && typeof data.action === "string") return { action: data.action, arguments: data.arguments === undefined ? {} : data.arguments };
    if (data?.accordtrace && typeof data.accordtrace.action === "string") return { action: data.accordtrace.action, arguments: data.accordtrace.arguments === undefined ? {} : data.accordtrace.arguments };
  }
  return null;
}

async function readJson(request) {
  try { return await readJsonBody(request); }
  catch (error) { if (error instanceof InputError) throw new ProofError(error.message, error.status); throw error; }
}

function actionError(id, error) {
  const status = error instanceof ProofError ? error.status : 500;
  const code = error instanceof ProofError ? -32602 : -32603;
  const response = rpcError(id, code, error instanceof Error ? error.message : "Internal error");
  return new Response(response.body, { status, headers: response.headers });
}

// Validate envelopes before dispatch. Notifications receive no JSON-RPC
// result and never execute a request-only proof/checkout action.
function isObject(value) { return value !== null && typeof value === 'object' && !Array.isArray(value); }
function rpcPreflight(body) {
  const id = body.id;
  const hasId = Object.hasOwn(body, 'id');
  const idValid = !hasId || id === null || typeof id === 'string' && id.length <= 200
    || typeof id === 'number' && Number.isFinite(id);
  if (body.jsonrpc !== '2.0' || !idValid || typeof body.method !== 'string'
      || !body.method || body.method.length > 128) {
    return json({ jsonrpc: '2.0', id: null, error: { code: -32600, message: 'Invalid JSON-RPC request' } }, 400);
  }
  if (!hasId) return new Response(null, { status: 202 });
  if (Object.hasOwn(body, 'params') && !isObject(body.params)) {
    return json({ jsonrpc: '2.0', id, error: { code: -32602, message: 'This method requires named object parameters' } }, 400);
  }
  return null;
}

function rpcResult(id, result) { return json({ jsonrpc: "2.0", id, result }); }
function rpcError(id, code, message) { return json({ jsonrpc: "2.0", id, error: { code, message } }); }

function json(body, status = 200, extraHeaders = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store", ...extraHeaders }
  });
}
