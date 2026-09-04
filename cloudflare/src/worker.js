import legacyWorker from "./index.js";
import { handleMarketplace, MarketplaceError } from "./marketplace.js";
import { handleSecurity, SecurityError } from "./security.js";
import { handleTrust, TrustError } from "./trust.js";

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);

    if (url.pathname.startsWith("/api/v1/trust/")) {
      try {
        const response = await handleTrust(request, env, url);
        if (response) return withCors(response);
      } catch (error) {
        const status = error instanceof TrustError ? error.status : 500;
        const body = {
          error: error instanceof TrustError ? "invalid_trust_request" : "internal_error",
          message: error instanceof Error ? error.message : "Unknown error"
        };
        return withCors(new Response(JSON.stringify(body), {
          status,
          headers: { "content-type": "application/json; charset=utf-8" }
        }));
      }
    }

    if (url.pathname.startsWith("/api/v1/security/")) {
      try {
        const response = await handleSecurity(request, env, url);
        if (response) return withCors(response);
      } catch (error) {
        const status = error instanceof SecurityError ? error.status : 500;
        const body = {
          error: error instanceof SecurityError ? "invalid_security_request" : "internal_error",
          message: error instanceof Error ? error.message : "Unknown error"
        };
        return withCors(new Response(JSON.stringify(body), {
          status,
          headers: { "content-type": "application/json; charset=utf-8" }
        }));
      }
    }

    if (url.pathname.startsWith("/api/v1/marketplace/")) {
      try {
        const response = await handleMarketplace(request, env, url);
        if (response) return withCors(response);
      } catch (error) {
        const status = error instanceof MarketplaceError ? error.status : 500;
        const body = {
          error: error instanceof MarketplaceError ? "invalid_marketplace_request" : "internal_error",
          message: error instanceof Error ? error.message : "Unknown error"
        };
        return withCors(new Response(JSON.stringify(body), {
          status,
          headers: { "content-type": "application/json; charset=utf-8" }
        }));
      }
    }

    return legacyWorker.fetch(request, env, ctx);
  }
};

function withCors(response) {
  const headers = new Headers(response.headers);
  headers.set("access-control-allow-origin", "*");
  headers.set("access-control-allow-methods", "GET, POST, OPTIONS");
  headers.set("access-control-allow-headers", "content-type");
  headers.set("cache-control", "no-store");
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers
  });
}
