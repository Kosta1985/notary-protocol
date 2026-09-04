import { PaymentAdapterError } from "./index.js";

const JSON_HEADERS = { "content-type": "application/json" };

export function createX402Adapter(env) {
  const enabled = String(env.X402_VERIFY_ENABLED ?? "false").toLowerCase() === "true";
  const facilitator = normalizeFacilitator(env.X402_FACILITATOR_URL, enabled);

  return {
    rail: "x402",
    mode: enabled ? "verify" : "disabled",
    facilitator,
    async verify({ paymentPayload, paymentRequirements, paymentHeaderDigest }) {
      if (!enabled) throw new PaymentAdapterError("x402_verification_disabled", 503);
      if (!facilitator) throw new PaymentAdapterError("x402_facilitator_url_required", 503);
      if (!paymentPayload || typeof paymentPayload !== "object" || Array.isArray(paymentPayload)) {
        throw new PaymentAdapterError("invalid_x402_payment_payload", 400);
      }
      if (!paymentRequirements || typeof paymentRequirements !== "object" || Array.isArray(paymentRequirements)) {
        throw new PaymentAdapterError("invalid_x402_payment_requirements", 400);
      }

      const response = await fetch(`${facilitator}/verify`, {
        method: "POST",
        headers: JSON_HEADERS,
        body: JSON.stringify({
          x402Version: 2,
          paymentPayload,
          paymentRequirements
        }),
        redirect: "error",
        signal: AbortSignal.timeout(5000)
      });
      let result;
      try { result = await response.json(); }
      catch { throw new PaymentAdapterError("x402_facilitator_invalid_response", 502); }
      if (!response.ok) throw new PaymentAdapterError("x402_facilitator_error", 502, sanitize(result));
      if (!result || typeof result !== "object") throw new PaymentAdapterError("x402_facilitator_invalid_response", 502);

      const valid = Boolean(result.isValid ?? result.valid);
      return {
        valid,
        rail: "x402",
        facilitator,
        payment_header_digest: paymentHeaderDigest,
        payer: safeText(result.payer, 256),
        invalid_reason: valid ? null : safeText(result.invalidReason ?? result.reason, 300),
        raw_status: valid ? "authorized" : "rejected"
      };
    }
  };
}

function normalizeFacilitator(value, required) {
  if (!value) {
    if (required) throw new PaymentAdapterError("x402_facilitator_url_required", 503);
    return null;
  }
  try {
    const url = new URL(String(value));
    if (url.protocol !== "https:" || url.username || url.password || url.search || url.hash) throw new Error();
    return url.href.replace(/\/$/, "");
  } catch {
    throw new PaymentAdapterError("invalid_x402_facilitator_url", 500);
  }
}
function safeText(value, max) { return typeof value === "string" ? value.slice(0, max) : null; }
function sanitize(value) {
  if (!value || typeof value !== "object") return null;
  const out = {};
  for (const [key, item] of Object.entries(value).slice(0, 12)) {
    if (/secret|key|signature|payload|token|authorization/i.test(key)) continue;
    if (["string","number","boolean"].includes(typeof item)) out[key] = typeof item === "string" ? item.slice(0, 200) : item;
  }
  return out;
}
