import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { createServer } from "../src/server.js";

test("HTTP flow creates and retrieves a receipt", async (context) => {
  const dataDir = mkdtempSync(join(tmpdir(), "notary-test-"));
  const server = createServer({ dataDir });
  context.after(() => { server.close(); rmSync(dataDir, { recursive: true, force: true }); });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const baseUrl = `http://127.0.0.1:${server.address().port}`;

  const health = await fetch(`${baseUrl}/health`).then((response) => response.json());
  assert.equal(health.status, "ok");

  assert.equal((await fetch(`${baseUrl}/`)).status, 200);
  const stats = await fetch(`${baseUrl}/v1/stats`).then((response) => response.json());
  assert.equal(stats.totals.page_view, 1);

  const envelope = await fetch(`${baseUrl}/v1/demo`).then((response) => response.json());
  const verifyResponse = await fetch(`${baseUrl}/v1/verify`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(envelope) });
  assert.equal(verifyResponse.status, 200);
  const receipt = await verifyResponse.json();
  assert.equal(receipt.valid, true);

  const updatedStats = await fetch(`${baseUrl}/v1/stats`).then((response) => response.json());
  assert.equal(updatedStats.totals.verification_valid, 1);

  const stored = await fetch(`${baseUrl}/v1/receipts/${receipt.id}`).then((response) => response.json());
  assert.deepEqual(stored, receipt);

  const receiptCheck = await fetch(`${baseUrl}/v1/receipts/verify`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(receipt) }).then((response) => response.json());
  assert.equal(receiptCheck.valid, true);

  const a2a = await fetch(`${baseUrl}/a2a`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "message/send", params: { message: { parts: [{ data: { dealEnvelope: envelope } }] } } })
  }).then((response) => response.json());
  assert.equal(a2a.result.artifacts[0].parts[0].data.notaryReceipt.valid, true);
});
