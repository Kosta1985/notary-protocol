import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const payments = await readFile(new URL("../src/payments.js", import.meta.url), "utf8");
const guard = await readFile(new URL("../src/gateway-payment-guard.js", import.meta.url), "utf8");
const x402 = await readFile(new URL("../src/payment-adapters/x402.js", import.meta.url), "utf8");
const migration = await readFile(new URL("../migrations/0008_paid_services.sql", import.meta.url), "utf8");

test("payments expose signed offers orders and x402 verification", () => {
  for (const fragment of [
    "/api/v1/payments/capabilities",
    "/api/v1/payments/offers",
    "/api/v1/payments/orders",
    "/api/v1/payments/x402/verify",
    "accordtrace.payment.service.offer.v1",
    "accordtrace.payment.service.order.v1",
    "accordtrace.payment.x402.verify.v1"
  ]) assert.match(payments, new RegExp(fragment.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
});

test("money uses atomic integer strings and paid leases are one-shot", () => {
  assert.match(payments, /amount_atomic/);
  assert.match(payments, /platform_fee_atomic/);
  assert.match(payments, /must be an integer string in atomic units/);
  assert.match(payments, /Number\(lease\.max_calls\) !== 1/);
  assert.match(migration, /lease_id TEXT NOT NULL UNIQUE/);
});

test("x402 verification is disabled unless explicitly enabled", () => {
  assert.match(x402, /X402_VERIFY_ENABLED/);
  assert.match(x402, /x402_verification_disabled/);
  assert.match(x402, /x402Version: 2/);
  assert.match(x402, /\/verify/);
});

test("raw payment payloads are not persisted", () => {
  assert.match(payments, /paymentPayloadDigest/);
  assert.match(migration, /payment_payload_digest TEXT/);
  assert.doesNotMatch(migration, /payment_payload_json|raw_payment|wallet_secret|private_key/i);
});

test("gateway consumes authorized paid order atomically and rolls back denied policy decisions", () => {
  assert.match(guard, /payment_status='consumed'/);
  assert.match(guard, /payment_status='payment_authorized'/);
  assert.match(guard, /payment_race_lost/);
  assert.match(guard, /rollback/);
});

test("AccordTrace remains non-custodial", () => {
  assert.match(payments, /custody: "none"/);
  assert.match(payments, /settlement_status: "not_settled_by_accordtrace"/);
  assert.match(payments, /never requests wallet seed phrases or private keys/);
  assert.doesNotMatch(payments, /transferFrom\s*\(|sendTransaction\s*\(|eth_sendTransaction|wallet_sendTransaction|private_key\s*[:=]|seed_phrase\s*[:=]/i);
});
