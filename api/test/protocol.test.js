import assert from "node:assert/strict";
import { createPublicKey, generateKeyPairSync, verify } from "node:crypto";
import { readFileSync } from "node:fs";
import test from "node:test";
import { canonicalize, digest } from "../src/canonicalize.js";
import { createSignedDemo } from "../src/demo.js";
import { createNotary } from "../src/notary.js";
import { signingPayload } from "../src/protocol.js";

test("canonicalize sorts keys recursively and normalizes negative zero", () => {
  assert.equal(canonicalize({ z: -0, a: { y: 2, x: 1 } }), '{"a":{"x":1,"y":2},"z":0}');
  assert.throws(() => canonicalize({ value: Number.NaN }), /Non-finite/);
  assert.throws(() => canonicalize("\ud800"), /Lone surrogate/);
});

test("a signed demo envelope produces a verifiable positive receipt", () => {
  const envelope = createSignedDemo(new Date("2026-08-24T05:00:00.000Z"));
  const { privateKey } = createEphemeralPrivateKey();
  const notary = createNotary({ privateKey });
  const receipt = notary.verify(envelope, new Date("2026-08-24T05:01:00.000Z"));
  assert.equal(receipt.valid, true);
  assert.deepEqual(receipt.violations, []);
  assert.equal(receipt.evidenceDigest, digest(envelope));

  const { notary: signature, ...unsigned } = receipt;
  assert.equal(verify(null, Buffer.from(canonicalize(unsigned)), createPublicKey(signature.publicKey), Buffer.from(signature.signature, "base64url")), true);
  assert.equal(notary.verifyReceipt(receipt).valid, true);

  receipt.evidenceDigest = "tampered";
  assert.equal(notary.verifyReceipt(receipt).valid, false);
});

test("tampered terms produce a signed negative receipt", () => {
  const envelope = createSignedDemo(new Date("2026-08-24T05:00:00.000Z"));
  envelope.offer.terms.outputFormat = "text/plain";
  const { privateKey } = createEphemeralPrivateKey();
  const receipt = createNotary({ privateKey }).verify(envelope, new Date("2026-08-24T05:01:00.000Z"));
  assert.equal(receipt.valid, false);
  assert.equal(receipt.violations.includes("initiator_signature"), true);
  assert.equal(receipt.violations.includes("counterparty_signature"), true);
});

test("published conformance vectors match canonical and verification behavior", () => {
  const read = (name) => JSON.parse(readFileSync(new URL(`../../protocol/test-vectors/${name}`, import.meta.url), "utf8"));
  const envelope = read("valid-envelope.json");
  const tampered = read("tampered-envelope.json");
  const expected = read("expected.json");
  const { privateKey } = createEphemeralPrivateKey();
  const notary = createNotary({ privateKey });
  assert.equal(notary.verify(envelope, new Date("2026-08-24T00:00:02Z")).valid, true);
  const negative = notary.verify(tampered, new Date("2026-08-24T00:00:02Z"));
  assert.equal(negative.violations.includes("initiator_signature"), true);
  assert.equal(negative.violations.includes("counterparty_signature"), true);
  assert.equal(digest(envelope), expected.evidenceDigest);
  assert.equal(canonicalize(signingPayload(envelope, "initiator")), expected.initiatorSigningPayload);
  assert.equal(canonicalize(signingPayload(envelope, "counterparty")), expected.counterpartySigningPayload);
});

function createEphemeralPrivateKey() {
  return generateKeyPairSync("ed25519");
}
