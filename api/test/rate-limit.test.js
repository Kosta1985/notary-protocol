import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { createServer } from "../src/server.js";

test("POST endpoints return 429 after the configured request limit", async (context) => {
  const dataDir = mkdtempSync(join(tmpdir(), "notary-rate-test-"));
  const server = createServer({ dataDir, rateLimit: { limit: 1, windowMs: 60_000 } });
  context.after(() => { server.close(); rmSync(dataDir, { recursive: true, force: true }); });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const url = `http://127.0.0.1:${server.address().port}/v1/verify`;
  const first = await fetch(url, { method: "POST", headers: { "content-type": "application/json" }, body: "{}" });
  const second = await fetch(url, { method: "POST", headers: { "content-type": "application/json" }, body: "{}" });

  assert.equal(first.status, 422);
  assert.equal(second.status, 429);
  assert.equal(second.headers.has("retry-after"), true);
});
