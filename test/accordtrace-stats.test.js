import test from "node:test";
import assert from "node:assert/strict";
import { probeAccordTrace } from "../scripts/accordtrace-stats.js";

function jsonResponse(body, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
}

test("stats probe reports modern proof MCP and A2A usage separately", async () => {
  const fetcher = async (url) => {
    const value = String(url);
    if (value === "https://accordtrace.notary-labs.workers.dev/") return new Response("<title>Accord Trace</title>", { status: 200 });
    if (value.endsWith("/.well-known/agent-card.json")) return jsonResponse({ name: "Accord Trace" });
    if (value === "https://accordtrace.notary-labs.workers.dev/api/v1/stats") {
      return jsonResponse({
        windowDays: 30,
        totals: {
          proof_created: 12,
          proof_verified: 9,
          proof_verification_failed: 2,
          mcp_request: 33,
          mcp_tool_call: 20,
          a2a_request: 14,
          verification_valid: 999
        },
        daily: [],
        privacy: "Aggregate event counts only"
      });
    }
    if (value === "https://notary-protocol.notary-labs.workers.dev/v1/stats") {
      return jsonResponse({ totals: { page_view: 4, verification_valid: 7 } });
    }
    return new Response("not found", { status: 404 });
  };

  const result = await probeAccordTrace(fetcher);
  assert.equal(result.accordTrace.publicStatsStatus, 200);
  assert.equal(result.accordTrace.modernUsage.proofsCreated, 12);
  assert.equal(result.accordTrace.modernUsage.proofsVerified, 9);
  assert.equal(result.accordTrace.modernUsage.proofVerificationFailures, 2);
  assert.equal(result.accordTrace.modernUsage.mcpRequests, 33);
  assert.equal(result.accordTrace.modernUsage.mcpToolCalls, 20);
  assert.equal(result.accordTrace.modernUsage.a2aRequests, 14);
  assert.equal(result.accordTrace.verifiedProofCount, 9, "modern proof verification must take precedence over legacy verification_valid");
  assert.match(result.accordTrace.note, /exclude monitoring traffic/i);
});
