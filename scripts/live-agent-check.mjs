import assert from "node:assert/strict";
import { createCheckRunner } from "./check-runner.mjs";

const base = String(process.argv[2] || "https://accordtrace.notary-labs.workers.dev").replace(/\/$/, "");
const runner = createCheckRunner();
const context = {};

async function requestJson(path, init = {}, expected = [200]) {
  const response = await fetch(`${base}${path}`, {
    ...init,
    headers: {
      "x-notary-monitor": "live-smoke",
      ...(init.headers ?? {})
    }
  });
  const text = await response.text();
  assert.ok(expected.includes(response.status), `${path}: HTTP ${response.status}: ${text.slice(0, 300)}`);
  try {
    return JSON.parse(text);
  } catch {
    assert.fail(`${path}: response was not valid JSON: ${text.slice(0, 300)}`);
  }
}

function a2aAction(action, args = {}, id = `a2a-${action}`) {
  return requestJson("/a2a", {
    method: "POST",
    headers: { "content-type": "application/json", "A2A-Version": "1.0" },
    body: JSON.stringify({
      jsonrpc: "2.0",
      id,
      method: "SendMessage",
      params: {
        message: {
          role: "ROLE_USER",
          messageId: crypto.randomUUID(),
          parts: [{ data: { action, arguments: args }, mediaType: "application/json" }]
        }
      }
    })
  });
}

async function mcp(method, params, id) {
  const body = {
    jsonrpc: "2.0",
    id,
    method,
    params: {
      ...params,
      _meta: {
        "io.modelcontextprotocol/protocolVersion": "2026-07-28",
        "io.modelcontextprotocol/clientInfo": { name: "accord-trace-external-check", version: "1.0.0" },
        "io.modelcontextprotocol/clientCapabilities": {}
      }
    }
  };
  const headers = { "content-type": "application/json", "MCP-Protocol-Version": "2026-07-28", "Mcp-Method": method };
  if (method === "tools/call") headers["Mcp-Name"] = params.name;
  return requestJson("/mcp", { method: "POST", headers, body: JSON.stringify(body) });
}

function validateWalletCapabilities(wallet) {
  assert.equal(wallet.service, "AccordTrace Agent Wallet");
  assert.equal(wallet.audience, "autonomous_agents");
  assert.equal(wallet.machine_first, true);
  assert.equal(wallet.authentication?.algorithm, "Ed25519");
  assert.equal(wallet.authentication?.nonce_replay_protection, true);
  assert.equal(wallet.payment_contract?.idempotency_key_required, true);
  assert.equal(wallet.payment_contract?.funded_balance_only, true);
  assert.equal(wallet.payment_contract?.negative_balances, false);
  assert.equal(wallet.payment_contract?.guardian_approval_creates_funds, false);
  assert.equal(wallet.credit_and_lending?.enabled, false);
  for (const boundary of ["loans","borrowing","credit_lines","overdrafts","debt_balances","interest","yield_lending","collateral","leverage","margin","liquidation"]) {
    assert.equal(wallet.credit_and_lending?.[boundary], false, `wallet credit boundary drift: ${boundary}`);
  }
  assert.equal(wallet.machine_protocols?.mutations_require_direct_passport_signed_request, true);
  assert.equal(wallet.endpoints?.payments, "/api/v1/agent/payments");
}

await runner.run("agent-card", async () => {
  const card = await requestJson("/.well-known/agent-card.json");
  assert.equal(card.name, "Accord Trace");
  assert.equal(card.supportedInterfaces?.[0]?.protocolVersion, "1.0");
  for (const skill of ["notarize_evidence", "verify_proof", "network_capabilities", "network_stats", "passport_product_capabilities", "wallet_capabilities", "resolve_referral"]) {
    assert.ok(card.skills?.some((candidate) => candidate.id === skill), `Agent Card missing ${skill}`);
  }
  context.card = card;
});

await runner.run("legacy-agent-card", async () => {
  const legacyResponse = await fetch(`${base}/.well-known/agent.json`);
  context.legacyStatus = legacyResponse.status;
  if (legacyResponse.status === 200) {
    const legacyCard = await legacyResponse.json();
    assert.equal(legacyCard.name, context.card.name);
    assert.equal(legacyCard.supportedInterfaces?.[0]?.url, context.card.supportedInterfaces?.[0]?.url);
    assert.ok(legacyCard.skills?.some((skill) => skill.id === "verify_proof"));
    assert.ok(legacyCard.skills?.some((skill) => skill.id === "wallet_capabilities"));
  } else {
    assert.equal(legacyResponse.status, 404, `legacy agent.json returned unexpected HTTP ${legacyResponse.status}`);
  }
}, ["agent-card"]);

await runner.run("discovery-docs", async () => {
  const openapi = await requestJson("/openapi.json");
  assert.ok(openapi.paths?.["/api/v1/proofs"]);
  assert.ok(openapi.paths?.["/mcp"]);
  assert.ok(openapi.paths?.["/api/v1/agent/wallet-capabilities"]);
  assert.ok(openapi.paths?.["/api/v1/agent/payments"]);
  const llmsResponse = await fetch(`${base}/llms.txt`);
  assert.equal(llmsResponse.status, 200);
  assert.match(await llmsResponse.text(), /independently integrity-checked later/i);
});

await runner.run("agent-wallet-rest-discovery", async () => {
  const wallet = await requestJson("/api/v1/agent/wallet-capabilities");
  validateWalletCapabilities(wallet);
  context.walletCapabilities = wallet;
});

const evidence = { event: "external-agent-production-check", source: "github-actions", run: process.env.GITHUB_RUN_ID || `manual-${Date.now()}` };
await runner.run("proof-rest", async () => {
  const create = await requestJson("/api/v1/proofs", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ data: evidence, metadata: { synthetic: true, client: "external-agent-check" } })
  }, [201]);
  assert.match(create.proof_id, /^atp_/);
  assert.ok(["service_recorded_hash", "issuer_signed_hash"].includes(create.integrity_mode));

  const retrieved = await requestJson(`/api/v1/proofs/${encodeURIComponent(create.proof_id)}`);
  assert.equal(retrieved.hash, create.hash);
  const verified = await requestJson("/api/v1/verify", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ proof_id: create.proof_id, data: evidence })
  });
  assert.equal(verified.valid, true);
  assert.equal(verified.hash_match, true);
  context.proof = create;
});

await runner.run("a2a-proof", async () => {
  const a2aVerify = await a2aAction("verify_proof", { proof_id: context.proof.proof_id, data: evidence }, "external-a2a-verify");
  assert.equal(a2aVerify.result?.task?.artifacts?.[0]?.parts?.[0]?.data?.valid, true);
}, ["proof-rest"]);

await runner.run("a2a-growth", async () => {
  const a2aNetwork = await a2aAction("network_capabilities", {}, "external-a2a-network");
  const a2aNetworkData = a2aNetwork.result?.task?.artifacts?.[0]?.parts?.[0]?.data;
  assert.equal(a2aNetworkData?.model, "single_level_direct_product_referral");
  assert.equal(a2aNetworkData?.cash_payouts_enabled, false);
});

await runner.run("a2a-wallet-discovery", async () => {
  const response = await a2aAction("wallet_capabilities", {}, "external-a2a-wallet");
  const wallet = response.result?.task?.artifacts?.[0]?.parts?.[0]?.data;
  validateWalletCapabilities(wallet);
  assert.deepEqual(wallet.credit_and_lending, context.walletCapabilities.credit_and_lending);
}, ["agent-wallet-rest-discovery"]);

await runner.run("mcp-discovery", async () => {
  const discovered = await mcp("server/discover", {}, "external-mcp-discover");
  assert.ok(discovered.result?.supportedVersions?.includes("2026-07-28"));
  const listed = await mcp("tools/list", {}, "external-mcp-list");
  for (const tool of [
    "accord_trace_verify",
    "accord_trace_network_capabilities",
    "accord_trace_network_stats",
    "accord_trace_passport_product_capabilities",
    "accord_trace_wallet_capabilities",
    "accord_trace_resolve_referral"
  ]) assert.ok(listed.result?.tools?.some((candidate) => candidate.name === tool), `MCP missing ${tool}`);
});

await runner.run("mcp-proof", async () => {
  const mcpVerified = await mcp("tools/call", { name: "accord_trace_verify", arguments: { proof_id: context.proof.proof_id, data: evidence } }, "external-mcp-verify");
  assert.equal(mcpVerified.result?.structuredContent?.valid, true);
}, ["proof-rest"]);

await runner.run("mcp-growth", async () => {
  const mcpNetwork = await mcp("tools/call", { name: "accord_trace_network_capabilities", arguments: {} }, "external-mcp-network");
  assert.equal(mcpNetwork.result?.structuredContent?.model, "single_level_direct_product_referral");
  assert.equal(mcpNetwork.result?.structuredContent?.passport_price?.amount_atomic, 200);
  assert.equal(mcpNetwork.result?.structuredContent?.direct_commission?.amount_atomic, 100);
  assert.equal(mcpNetwork.result?.structuredContent?.cash_payouts_enabled, false);

  const mcpStats = await mcp("tools/call", { name: "accord_trace_network_stats", arguments: {} }, "external-mcp-network-stats");
  assert.equal(mcpStats.result?.structuredContent?.invitation_payloads?.classification, "generated_payloads_not_sales");

  const mcpProduct = await mcp("tools/call", { name: "accord_trace_passport_product_capabilities", arguments: {} }, "external-mcp-passport-product");
  assert.equal(mcpProduct.result?.structuredContent?.product?.id, "agent_passport_certificate");
  assert.equal(mcpProduct.result?.structuredContent?.product?.price?.amount_atomic, 200);
  assert.equal(mcpProduct.result?.structuredContent?.cash_affiliate_payouts_enabled, false);
});

await runner.run("mcp-wallet-discovery", async () => {
  const response = await mcp("tools/call", { name: "accord_trace_wallet_capabilities", arguments: {} }, "external-mcp-wallet");
  const wallet = response.result?.structuredContent;
  validateWalletCapabilities(wallet);
  assert.deepEqual(wallet.payment_contract, context.walletCapabilities.payment_contract);
}, ["agent-wallet-rest-discovery"]);

await runner.run("affiliate-rest", async () => {
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
});

await runner.run("passport-product", async () => {
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
  context.passportProduct = passportProduct;
});

if (!runner.ok) {
  process.stdout.write(`${JSON.stringify({
    status: "failed",
    service: base,
    proof_id: context.proof?.proof_id ?? null,
    proof_integrity_mode: context.proof?.integrity_mode ?? null,
    passed_stages: runner.passed,
    failed_stages: runner.failures,
    skipped_stages: runner.skipped
  }, null, 2)}\n`);
  process.exitCode = 1;
} else {
  process.stdout.write(`${JSON.stringify({
    status: "passed",
    service: base,
    proof_id: context.proof.proof_id,
    proof_integrity_mode: context.proof.integrity_mode,
    rest: "passed",
    a2a: "passed",
    mcp: "passed",
    agent_growth_discovery: "passed",
    agent_wallet_discovery: "passed",
    affiliate_network: "passed",
    passport_product_safety: "passed",
    passport_product_commercial_ready: Boolean(context.passportProduct.commercial_ready),
    wallet_enabled: Boolean(context.walletCapabilities.wallet_enabled),
    wallet_payments_enabled: Boolean(context.walletCapabilities.payments_enabled),
    wallet_credit_and_lending_enabled: Boolean(context.walletCapabilities.credit_and_lending?.enabled),
    legacy_a2a_alias: context.legacyStatus === 200 ? "present" : "absent"
  }, null, 2)}\n`);
}