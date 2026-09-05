import coreWorker from "./worker.js";
import { handleInteroperability } from "./interoperability.js";
import { handleProofs, ProofError } from "./proofs.js";
import { handleStats } from "./stats.js";
import { recordAggregateEvent } from "./telemetry.js";
import { passportSafeEnv } from "./passport-signer-readiness.js";

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    if (request.method === "OPTIONS" && (url.pathname === "/mcp" || url.pathname === "/a2a" || url.pathname === "/api/v1/stats" || url.pathname.startsWith("/api/v1/proofs") || url.pathname === "/api/v1/hash" || url.pathname === "/api/v1/verify")) {
      return cors(new Response(null, { status: 204 }));
    }

    try {
      const interoperability = await handleInteroperability(request, env, url);
      if (interoperability) {
        if (request.method === "POST" && url.pathname === "/a2a") await recordAggregateEvent(env, "a2a_request", request);
        if (request.method === "POST" && url.pathname === "/mcp") await recordAggregateEvent(env, "mcp_request", request);
        return cors(interoperability);
      }
    } catch (error) {
      return cors(errorResponse(error));
    }

    if (url.pathname === "/api/v1/stats") {
      try {
        const statsResponse = await handleStats(request, env, url);
        if (statsResponse) return cors(statsResponse);
      } catch (error) {
        return cors(errorResponse(error));
      }
    }

    if (url.pathname.startsWith("/api/v1/proofs") || url.pathname === "/api/v1/hash" || url.pathname === "/api/v1/verify") {
      try {
        const proofResponse = await handleProofs(request, env, url);
        if (proofResponse) {
          if (proofResponse.status < 400) {
            if (request.method === "POST" && url.pathname === "/api/v1/proofs") await recordAggregateEvent(env, "proof_created", request);
            if (request.method === "GET" && url.pathname.startsWith("/api/v1/proofs/")) await recordAggregateEvent(env, "proof_retrieved", request);
            if (request.method === "POST" && url.pathname === "/api/v1/hash") await recordAggregateEvent(env, "proof_hash_computed", request);
            if (request.method === "POST" && url.pathname === "/api/v1/verify") {
              await recordAggregateEvent(env, "proof_verify_started", request);
              try {
                const verification = await proofResponse.clone().json();
                await recordAggregateEvent(env, verification?.valid ? "proof_verify_valid" : "proof_verify_invalid", request);
              } catch {
                // The protocol response remains authoritative if telemetry parsing fails.
              }
            }
          }
          return cors(proofResponse);
        }
      } catch (error) {
        return cors(errorResponse(error));
      }
    }

    const coreEnv = url.pathname.startsWith("/api/v1/passport-product/") ? passportSafeEnv(env) : env;
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
  headers.set("access-control-allow-methods", "GET, POST, OPTIONS");
  headers.set("access-control-allow-headers", "content-type, authorization, a2a-version, mcp-protocol-version, mcp-method, mcp-name, x-notary-monitor");
  headers.set("x-content-type-options", "nosniff");
  return new Response(response.body, { status: response.status, statusText: response.statusText, headers });
}
