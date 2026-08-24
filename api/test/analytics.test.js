import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { AnalyticsStore } from "../src/analytics.js";

test("analytics stores aggregate event counts without identifiers", () => {
  const directory = mkdtempSync(join(tmpdir(), "notary-analytics-test-"));
  try {
    const store = new AnalyticsStore(join(directory, "analytics.json"));
    store.record("page_view", new Date("2026-08-23T10:00:00Z"));
    store.record("page_view", new Date("2026-08-24T10:00:00Z"));
    store.record("verification_valid", new Date("2026-08-24T10:00:00Z"));
    const summary = store.summary(2, new Date("2026-08-24T12:00:00Z"));
    assert.deepEqual(summary.totals, { page_view: 2, verification_valid: 1 });
    assert.equal(summary.daily.length, 2);
    assert.deepEqual(Object.keys(summary.daily[0]).sort(), ["day", "page_view"]);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});
