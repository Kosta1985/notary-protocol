import legacyWorker from "./index.js";
import { handleMarketplace, MarketplaceError } from "./marketplace.js";
import { handleSecurity, SecurityError } from "./security.js";
import { handleTrust, TrustError } from "./trust.js";
import { GatewayError } from "./gateway.js";
import { handlePaymentBoundGateway } from "./gateway-payment-guard.js";
import { handlePayments, PaymentError } from "./payments.js";
import { handleIdentity, IdentityError } from "./identity.js";
import { handleReputation, ReputationError } from "./reputation.js";
import { handleAttestorSafety, SafetyError } from "./attestor-safety.js";
import { handleControlPlane, ControlPlaneError } from "./control-plane.js";

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);

    if (url.pathname.startsWith("/api/v1/control-plane/")) {
      try {
        const response = await handleControlPlane(request, env, url);
        if (response) return withCors(response, true);
      } catch (error) {
        const status = error instanceof ControlPlaneError ? error.status : 500;
        return withCors(new Response(JSON.stringify({ error: error instanceof ControlPlaneError ? "invalid_control_plane_request" : "internal_error", message: error instanceof Error ? error.message : "Unknown error" }), { status, headers: { "content-type": "application/json; charset=utf-8" } }), true);
      }
    }

    if (url.pathname.startsWith("/api/v1/attestors/")) {
      try { const response = await handleAttestorSafety(request, env, url); if (response) return withCors(response); }
      catch (error) { const status = error instanceof SafetyError ? error.status : 500; return withCors(new Response(JSON.stringify({ error: error instanceof SafetyError ? "invalid_attestor_request" : "internal_error", message: error instanceof Error ? error.message : "Unknown error" }), { status, headers: { "content-type": "application/json; charset=utf-8" } })); }
    }
    if (url.pathname.startsWith("/api/v1/reputation/")) {
      try { const response = await handleReputation(request, env, url); if (response) return withCors(response); }
      catch (error) { const status = error instanceof ReputationError ? error.status : 500; return withCors(new Response(JSON.stringify({ error: error instanceof ReputationError ? "invalid_reputation_request" : "internal_error", message: error instanceof Error ? error.message : "Unknown error" }), { status, headers: { "content-type": "application/json; charset=utf-8" } })); }
    }
    if (url.pathname.startsWith("/api/v1/identity/")) {
      try { const response = await handleIdentity(request, env, url); if (response) return withCors(response); }
      catch (error) { const status = error instanceof IdentityError ? error.status : 500; return withCors(new Response(JSON.stringify({ error: error instanceof IdentityError ? "invalid_identity_request" : "internal_error", message: error instanceof Error ? error.message : "Unknown error" }), { status, headers: { "content-type": "application/json; charset=utf-8" } })); }
    }
    if (url.pathname.startsWith("/api/v1/payments/")) {
      try { const response = await handlePayments(request, env, url); if (response) return withCors(response); }
      catch (error) { const status = error instanceof PaymentError ? error.status : 500; const body = { error: error instanceof PaymentError ? "invalid_payment_request" : "internal_error", message: error instanceof Error ? error.message : "Unknown error" }; if (error instanceof PaymentError && error.details) body.details = error.details; return withCors(new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json; charset=utf-8" } })); }
    }
    if (url.pathname.startsWith("/api/v1/gateway/")) {
      try { const response = await handlePaymentBoundGateway(request, env, url); if (response) return withCors(response); }
      catch (error) { const status = error instanceof GatewayError ? error.status : 500; return withCors(new Response(JSON.stringify({ error: error instanceof GatewayError ? "invalid_gateway_request" : "internal_error", message: error instanceof Error ? error.message : "Unknown error" }), { status, headers: { "content-type": "application/json; charset=utf-8" } })); }
    }
    if (url.pathname.startsWith("/api/v1/trust/")) {
      try { const response = await handleTrust(request, env, url); if (response) return withCors(response); }
      catch (error) { const status = error instanceof TrustError ? error.status : 500; return withCors(new Response(JSON.stringify({ error: error instanceof TrustError ? "invalid_trust_request" : "internal_error", message: error instanceof Error ? error.message : "Unknown error" }), { status, headers: { "content-type": "application/json; charset=utf-8" } })); }
    }
    if (url.pathname.startsWith("/api/v1/security/")) {
      try { const response = await handleSecurity(request, env, url); if (response) return withCors(response); }
      catch (error) { const status = error instanceof SecurityError ? error.status : 500; return withCors(new Response(JSON.stringify({ error: error instanceof SecurityError ? "invalid_security_request" : "internal_error", message: error instanceof Error ? error.message : "Unknown error" }), { status, headers: { "content-type": "application/json; charset=utf-8" } })); }
    }
    if (url.pathname.startsWith("/api/v1/marketplace/")) {
      try { const response = await handleMarketplace(request, env, url); if (response) return withCors(response); }
      catch (error) { const status = error instanceof MarketplaceError ? error.status : 500; return withCors(new Response(JSON.stringify({ error: error instanceof MarketplaceError ? "invalid_marketplace_request" : "internal_error", message: error instanceof Error ? error.message : "Unknown error" }), { status, headers: { "content-type": "application/json; charset=utf-8" } })); }
    }
    return legacyWorker.fetch(request, env, ctx);
  }
};

function withCors(response, controlPlane = false) {
  const headers = new Headers(response.headers);
  headers.set("access-control-allow-origin", "*");
  headers.set("access-control-allow-methods", "GET, POST, OPTIONS");
  headers.set("access-control-allow-headers", "content-type, authorization");
  headers.set("cache-control", "no-store");
  if (controlPlane) {
    headers.set("content-security-policy", "default-src 'none'; frame-ancestors 'none'");
    headers.set("x-content-type-options", "nosniff");
    headers.set("referrer-policy", "no-referrer");
  }
  return new Response(response.body, { status: response.status, statusText: response.statusText, headers });
}
