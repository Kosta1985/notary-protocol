import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const hardening = await readFile(new URL("../src/payment-hardening.js", import.meta.url), "utf8");
const adapter = await readFile(new URL("../src/payment-adapters/x402.js", import.meta.url), "utf8");
const migration = await readFile(new URL("../migrations/0013_x402_hardening.sql", import.meta.url), "utf8");
const worker = await readFile(new URL("../src/worker.js", import.meta.url), "utf8");

test("hardened x402 routes run before legacy payments", () => {
  assert.match(worker,/handlePaymentHardening/);
  assert.match(worker,/const hardened = await handlePaymentHardening/);
  assert.match(hardening,/\/api\/v1\/payments\/orders/);
  assert.match(hardening,/\/api\/v1\/payments\/x402\/verify/);
});

test("payment requirements are stored and deterministic", () => {
  assert.match(hardening,/requirements_source:'stored_deterministic'/);
  assert.match(hardening,/x402_order_requirements/);
  assert.match(hardening,/Date\.parse\(offer\.expires_at\)-orderedAtMs/);
  assert.doesNotMatch(hardening,/maxTimeoutSeconds:[^\n]*Date\.now/);
  assert.match(migration,/requirements_digest TEXT NOT NULL/);
});

test("x402 v2 orders require CAIP-2 networks", () => {
  assert.match(hardening,/x402_v2_network_must_be_caip2/);
  assert.match(hardening,/isCaip2Network/);
  assert.match(hardening,/network_format:'CAIP-2'/);
});

test("verification requires an explicit facilitator and supported preflight", () => {
  assert.match(adapter,/x402_facilitator_url_required/);
  assert.doesNotMatch(adapter,/https:\/\/x402\.org\/facilitator/);
  assert.match(hardening,/\/supported/);
  assert.match(hardening,/x402Version\)===2/);
  assert.match(hardening,/x402_facilitator_does_not_support_requirements/);
  assert.match(migration,/x402_facilitator_support_cache/);
});

test("payment payload digest cannot be replayed across orders", () => {
  assert.match(hardening,/payment_payload_replay_detected/);
  assert.match(hardening,/replay\.order_id!==order\.id/);
  assert.match(migration,/payment_payload_digest TEXT PRIMARY KEY/);
});

test("payer reference is digest-only and raw payment payload is not persisted", () => {
  assert.match(hardening,/accordtrace\.x402\.payer\.v1/);
  assert.match(hardening,/payment_reference_digest/);
  assert.match(hardening,/payer_ref=NULL/);
  assert.match(hardening,/payer_reference:'digest_only'/);
  assert.doesNotMatch(migration,/payment_payload_json|raw_payment_payload|payer_ref TEXT/i);
});

test("x402 verify remains non-custodial and read-only in AccordTrace", () => {
  assert.match(hardening,/settlement_status:'not_settled_by_accordtrace'/);
  assert.match(hardening,/custody:'none'/);
  assert.doesNotMatch(hardening,/\/settle|sendTransaction|transferFrom\s*\(/i);
});
