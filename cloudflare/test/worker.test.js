import assert from "node:assert/strict";
import { generateKeyPairSync } from "node:crypto";
import test from "node:test";
import worker, { canonicalize, signingPayload } from "../src/index.js";

test("Cloudflare runtime uses the same canonical encoding", () => {
  assert.equal(canonicalize({ z: -0, a: { y: 2, x: 1 } }), '{"a":{"x":1,"y":2},"z":0}');
  assert.throws(() => canonicalize("\ud800"), /Lone surrogate/);
});

test("Cloudflare runtime applies signature domain separation", () => {
  const envelope = {
    version: "0.1", id: "deal", createdAt: "2026-08-24T00:00:00.000Z", expiresAt: null,
    initiator: { id: "a", publicKey: "key-a" }, counterparty: { id: "b", publicKey: "key-b" },
    offer: { id: "offer", createdAt: "2026-08-24T00:00:00.000Z", nonce: "1234567890123456", terms: {} },
    acceptance: { offerId: "offer", acceptedAt: "2026-08-24T00:00:01.000Z", nonce: "1234567890123456" }, signatures: []
  };
  assert.equal(signingPayload(envelope, "initiator").acceptance, undefined);
  assert.deepEqual(signingPayload(envelope, "counterparty").acceptance, envelope.acceptance);
});

test("Cloudflare Worker completes the public verification flow", async () => {
  const { privateKey } = generateKeyPairSync("ed25519");
  const env = {
    NOTARY_PRIVATE_JWK: JSON.stringify(privateKey.export({ format: "jwk" })),
    DB: new MemoryD1(),
    ASSETS: { fetch: async () => new Response("asset", { status: 200 }) }
  };

  assert.equal((await worker.fetch(new Request("https://notary.example/"), env)).status, 200);

  const capabilities = await worker.fetch(new Request("https://notary.example/v1/capabilities"), env).then((response) => response.json());
  assert.deepEqual(capabilities.protocolVersions, ["0.1"]);
  assert.equal(capabilities.endpoints.verify, "https://notary.example/v1/verify");

  assert.equal((await worker.fetch(new Request("https://notary.example/pilot/view", { method: "POST" }), env)).status, 200);
  const pilotRedirect = await worker.fetch(new Request("https://notary.example/pilot/apply"), env);
  assert.equal(pilotRedirect.status, 302);

  const demoResponse = await worker.fetch(new Request("https://notary.example/v1/demo"), env);
  assert.equal(demoResponse.status, 200);
  const envelope = await demoResponse.json();

  const receiptResponse = await worker.fetch(new Request("https://notary.example/v1/verify", {
    method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(envelope)
  }), env);
  assert.equal(receiptResponse.status, 200);
  const receipt = await receiptResponse.json();
  assert.equal(receipt.valid, true);
  assert.equal(receipt.checks.length, 16);

  const storedResponse = await worker.fetch(new Request(`https://notary.example/v1/receipts/${receipt.id}`), env);
  assert.deepEqual(await storedResponse.json(), receipt);

  const signatureResponse = await worker.fetch(new Request("https://notary.example/v1/receipts/verify", {
    method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(receipt)
  }), env);
  assert.equal((await signatureResponse.json()).valid, true);

  const statsResponse = await worker.fetch(new Request("https://notary.example/v1/stats"), env);
  const stats = await statsResponse.json();
  assert.equal(stats.totals.verification_valid, 1);
  assert.equal(stats.totals.pilot_page_view, 1);
  assert.equal(stats.totals.pilot_apply, 1);
});

class MemoryD1 {
  receipts = new Map();
  analytics = new Map();

  prepare(sql) {
    const database = this;
    return {
      values: [],
      bind(...values) { this.values = values; return this; },
      async run() {
        if (sql.startsWith("INSERT INTO receipts")) database.receipts.set(this.values[0], this.values[5]);
        if (sql.startsWith("INSERT INTO analytics_daily")) database.analytics.set(this.values[0], (database.analytics.get(this.values[0]) ?? 0) + 1);
        return { success: true };
      },
      async first() {
        if (!sql.startsWith("SELECT")) return null;
        const receipt = database.receipts.get(this.values[0]);
        return receipt ? { receipt } : null;
      },
      async all() {
        if (!sql.startsWith("SELECT day, event")) return { results: [] };
        return { results: [...database.analytics].map(([event, count]) => ({ day: "2026-08-24", event, count })) };
      }
    };
  }
}
