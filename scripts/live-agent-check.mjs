import assert from "node:assert/strict";

const base = String(process.argv[2] || "https://accordtrace.notary-labs.workers.dev").replace(/\/$/, "");

async function requestJson(path, init = {}, expected = [200]) {
  const response = await fetch(`${base}${path}`, init);
  const text = await response.text();
  assert.ok(expected.includes(response.status), `${path}: HTTP ${response.status}: ${text.slice(0, 300)}`);
  return JSON.parse(text);
}

const card = await requestJson("/.well-known/agent-card.json");
assert.equal(card.name, "Accord Trace");
assert.equal(card.supportedInterfaces?.[0]?.protocolVersion, "1.0");
assert.ok(card.skills?.some((skill) => skill.id === "notarize_evidence"));

const legacyResponse = await fetch(`${base}/.well-known/agent.json`);
if (legacyResponse.status === 200) {
  const legacyCard = await legacyResponse.json();
  assert.equal(legacyCard.name, card.name);
  assert.equal(legacyCard.supportedInterfaces?.[0]?.url, card.supportedInterfaces?.[0]?.url);
  assert.ok(legacyCard.skills?.some((skill) => skill.id === "verify_proof"));
} else {
  assert.equal(legacyResponse.status, 404, `legacy agent.json returned unexpected HTTP ${legacyResponse.status}`);
}

const openapi = await requestJson("/openapi.json");
assert.ok(openapi.paths?.["/api/v1/proofs"]);
assert.ok(openapi.paths?.["/mcp"]);
const llmsResponse = await fetch(`${base}/llms.txt`);
assert.equal(llmsResponse.status, 200);
assert.match(await llmsResponse.text(), /independently integrity-checked later/i);

const evidence = { event: "external-agent-production-check", source: "github-actions", run: process.env.GITHUB_RUN_ID || `manual-${Date.now()}` };
const create = await requestJson("/api/v1/proofs", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ data: evidence, metadata: { synthetic: true, client: "external-agent-check" } }) }, [201]);
assert.match(create.proof_id, /^atp_/);
assert.ok(["service_recorded_hash", "issuer_signed_hash"].includes(create.integrity_mode));
const retrieved = await requestJson(`/api/v1/proofs/${encodeURIComponent(create.proof_id)}`);
assert.equal(retrieved.hash, create.hash);
const verified = await requestJson("/api/v1/verify", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ proof_id: create.proof_id, data: evidence }) });
assert.equal(verified.valid, true);
assert.equal(verified.hash_match, true);

const a2a = await requestJson("/a2a", { method: "POST", headers: { "content-type": "application/json", "A2A-Version": "1.0" }, body: JSON.stringify({ jsonrpc: "2.0", id: "external-a2a-check", method: "SendMessage", params: { message: { role: "ROLE_USER", messageId: crypto.randomUUID(), parts: [{ data: { action: "verify_proof", arguments: { proof_id: create.proof_id, data: evidence } }, mediaType: "application/json" }] } } }) });
assert.equal(a2a.result?.task?.artifacts?.[0]?.parts?.[0]?.data?.valid, true);

async function mcp(method, params, id) {
  const body = { jsonrpc: "2.0", id, method, params: { ...params, _meta: { "io.modelcontextprotocol/protocolVersion": "2026-07-28", "io.modelcontextprotocol/clientInfo": { name: "accord-trace-external-check", version: "1.0.0" }, "io.modelcontextprotocol/clientCapabilities": {} } } };
  const headers = { "content-type": "application/json", "MCP-Protocol-Version": "2026-07-28", "Mcp-Method": method };
  if (method === "tools/call") headers["Mcp-Name"] = params.name;
  return requestJson("/mcp", { method: "POST", headers, body: JSON.stringify(body) });
}
const discovered = await mcp("server/discover", {}, "external-mcp-discover");
assert.ok(discovered.result?.supportedVersions?.includes("2026-07-28"));
const listed = await mcp("tools/list", {}, "external-mcp-list");
assert.ok(listed.result?.tools?.some((tool) => tool.name === "accord_trace_verify"));
const mcpVerified = await mcp("tools/call", { name: "accord_trace_verify", arguments: { proof_id: create.proof_id, data: evidence } }, "external-mcp-verify");
assert.equal(mcpVerified.result?.structuredContent?.valid, true);

const network = await requestJson("/api/v1/network/capabilities");
assert.equal(network.model, "single_level_direct_product_referral");
assert.equal(network.passport_price?.amount_atomic, 200);
assert.equal(network.direct_commission?.amount_atomic, 100);
assert.equal(network.cash_payouts_enabled, false);
assert.ok(network.rules?.includes("no_multilevel_downline_commission"));
assert.ok(network.rules?.includes("no_self_referral"));

const networkStats = await requestJson("/api/v1/network/stats");
assert.equal(networkStats.model, "single_level_direct_product_referral");
assert.equal(networkStats.cash_payouts_enabled, false);
assert.equal(networkStats.invitation_payloads?.classification, "generated_payloads_not_sales");
assert.match(networkStats.boundary || "", /invitation is not a customer, sale, earned commission or paid commission/i);

const passportProduct = await requestJson("/api/v1/passport-product/capabilities");
assert.equal(passportProduct.product?.id, "agent_passport_certificate");
assert.equal(passportProduct.product?.price?.amount_atomic, 200);
assert.equal(passportProduct.product?.price?.currency, "usd");
assert.equal(passportProduct.cash_affiliate_payouts_enabled, false);
assert.equal(passportProduct.affiliate_enrollment, "optional_and_separate");
if (passportProduct.commercial_ready) {
  assert.equal(passportProduct.checkout_enabled, true);
  assert.equal(passportProduct.webhook_enabled, true);
  assert.equal(passportProduct.certificate_signing_enabled, true);
  assert.equal(passportProduct.referral_pricing_consistent, true);
}

process.stdout.write(`${JSON.stringify({
  status: "passed",
  service: base,
  proof_id: create.proof_id,
  proof_integrity_mode: create.integrity_mode,
  rest: "passed",
  a2a: "passed",
  mcp: "passed",
  affiliate_network: "passed",
  passport_product_safety: "passed",
  passport_product_commercial_ready: Boolean(passportProduct.commercial_ready),
  legacy_a2a_alias: legacyResponse.status === 200 ? "present" : "absent"
}, null, 2)}\n`);
