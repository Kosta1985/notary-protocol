import { publicRouteResponse, metadataRequest, publicNotFound } from './public-routing.js';
import { secureResponse, unexpectedErrorResponse } from './response-security.js';
import coreWorker from "./worker.js";
import { handleInteroperability } from "./interoperability.js";
import { handleProofs, ProofError } from "./proofs.js";
import { passportSafeEnv } from "./passport-signer-readiness.js";
import { handleAgentWallet, agentWalletErrorResponse } from "./agent-wallet.js";
import { handleWalletCapabilities } from "./wallet-capabilities.js";

const application = {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const walletCapabilitiesRoute = url.pathname === '/api/v1/agent/wallet-capabilities';
    const walletRoute = url.pathname.startsWith('/api/v1/agent/') || url.pathname.startsWith('/api/v1/wallet-admin/');
    if (request.method === "OPTIONS" && (url.pathname === "/mcp" || url.pathname === "/a2a" || url.pathname.startsWith("/api/v1/proofs") || url.pathname === "/api/v1/hash" || url.pathname === "/api/v1/verify" || url.pathname === "/api/v1/stats" || walletRoute)) {
      return cors(new Response(null, { status: 204 }));
    }

    if (request.method === "GET" && url.pathname === "/api/v1/stats") {
      const statsUrl = new URL("/v1/stats", request.url);
      const statsRequest = new Request(statsUrl, { method: "GET", headers: request.headers });
      return cors(await coreWorker.fetch(statsRequest, env, ctx));
    }

    if (walletCapabilitiesRoute) {
      const response = handleWalletCapabilities(request, env, url);
      if (response) return cors(response);
    }

    if (walletRoute) {
      try {
        const walletResponse = await handleAgentWallet(request, env, url);
        if (walletResponse) return cors(walletResponse);
      } catch (error) {
        return cors(agentWalletErrorResponse(error));
      }
    }

    try {
      const interoperability = await handleInteroperability(request, env, url);
      if (interoperability) return cors(interoperability);
    } catch (error) {
      return cors(errorResponse(error));
    }

    if (url.pathname.startsWith("/api/v1/proofs") || url.pathname === "/api/v1/hash" || url.pathname === "/api/v1/verify") {
      try {
        const proofResponse = await handleProofs(request, env, url);
        if (proofResponse) return cors(proofResponse);
      } catch (error) {
        return cors(errorResponse(error));
      }
    }

    const coreEnv = url.pathname.startsWith("/api/v1/passport-product/") ? await passportSafeEnv(env) : env;
    return coreWorker.fetch(request, coreEnv, ctx);
  },

  async scheduled(controller, env, ctx) {
    return coreWorker.scheduled(controller, env, ctx);
  }
};

function errorResponse(error) {
  const status = error instanceof ProofError ? error.status : Number(error?.status) || 500;
  return new Response(JSON.stringify({
    error: error instanceof ProofError ? error.code : "interoperability_error",
    message: error instanceof Error ? error.message : "Unknown error"
  }), { status, headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" } });
}

function cors(response) {
  const headers = new Headers(response.headers);
  headers.set("access-control-allow-origin", "*");
  headers.set("access-control-allow-methods", "GET, HEAD, POST, OPTIONS");
  headers.set("access-control-allow-headers", "content-type, authorization, idempotency-key, x-accord-passport-id, x-accord-timestamp, x-accord-nonce, x-accord-signature, a2a-version, mcp-protocol-version, mcp-method, mcp-name, x-notary-monitor");
  headers.set("x-content-type-options", "nosniff");
  return new Response(response.body, { status: response.status, statusText: response.statusText, headers });
}

// Keep headers and unexpected-error redaction on every runtime response.
export default {
  async fetch(request, env, ctx) {
    try {
      const direct = publicRouteResponse(request);
      const response = direct || await application.fetch(metadataRequest(request), env, ctx);
      return await secureResponse(await publicNotFound(response, request, env), { method: request.method });
    }
    catch { return await secureResponse(unexpectedErrorResponse(), { method: request.method }); }
  },
  async scheduled(controller, env, ctx) { return application.scheduled(controller, env, ctx); }
};
