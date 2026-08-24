import assert from "node:assert/strict";
import test from "node:test";
import { summarizeAdoption } from "../../scripts/adoption-report.js";
import { runSmoke } from "../../scripts/live-smoke.js";

test("adoption summary calculates aggregate conversion rates", () => {
  const report = summarizeAdoption({ windowDays: 30, totals: { page_view: 20, verification_started: 5, verification_valid: 4, verification_invalid: 1, pilot_page_view: 4, pilot_apply: 1 } }, { stargazers_count: 3, forks_count: 2, subscribers_count: 1, open_issues_count: 4 });
  assert.equal(report.site.visitorToVerificationPercent, 25);
  assert.equal(report.site.successfulVerificationPercent, 80);
  assert.equal(report.github.stars, 3);
  assert.equal(report.site.pilotRequestPercent, 25);
});

test("live smoke completes the public verification sequence", async () => {
  const receipt = { id: "ntr_test", evidenceDigest: "digest", valid: true, checks: [{ passed: true }] };
  const responses = new Map([
    ["/health", { status: "ok" }],
    ["/v1/capabilities", { protocolVersions: ["0.1"] }],
    ["/v1/demo", { id: "deal_test" }],
    ["/v1/verify", receipt],
    ["/v1/receipts/verify", { valid: true }],
    ["/v1/receipts/ntr_test", receipt]
  ]);
  const fetcher = async (url) => new Response(JSON.stringify(responses.get(new URL(url).pathname)), { status: 200, headers: { "content-type": "application/json" } });
  const result = await runSmoke("https://notary.example", fetcher);
  assert.equal(result.status, "ok");
  assert.equal(result.mode, "full");
  assert.equal(result.receiptId, "ntr_test");
});

test("live smoke falls back to health-only before capabilities are deployed", async () => {
  const fetcher = async (url) => new URL(url).pathname === "/health"
    ? Response.json({ status: "ok" })
    : Response.json({ error: "not_found" }, { status: 404 });
  const result = await runSmoke("https://notary.example", fetcher);
  assert.equal(result.status, "ok");
  assert.equal(result.mode, "health-only");
});
