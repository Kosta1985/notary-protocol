import assert from "node:assert/strict";
import test from "node:test";
import { validateAll, validateApplication } from "../../scripts/validate-partner-applications.mjs";

test("partner applications and receipt catalog are internally consistent", async () => {
  const result = await validateAll();
  assert.ok(result.applications >= 1);
  assert.ok(result.receipts >= 1);
});

test("intake rejects external side effects and never implies acceptance", () => {
  const termsSha256 = "sha256:d1a97ba67863cf73c9cc83db803d5dd5aea4b50e2ae2b57718be783000c3281b";
  const base = {
    intake_version: "accordtrace-agent-intake/0.1",
    application_id: "app_test_agent_0001",
    application_is_acceptance: false,
    submitted_at: "2026-08-26T00:00:00Z",
    agent: { agent_id: "test-agent", agent_card_url: "https://example.com/.well-known/agent-card.json", interface: { type: "a2a", url: "https://example.com/a2a" } },
    pilot: { use_case: "Test one synthetic handoff.", proposed_test: "Return one fixed JSON object.", data_mode: "synthetic", financial_activity: false, personal_data: false, credentials: false, external_side_effects: false },
    consent: { terms_version: "0.1", terms_sha256: termsSha256, terms_accepted: true, public_attribution: false, publish_receipt: false, publish_response_excerpt: false, git_history_public_acknowledged: true },
    status: { state: "submitted", updated_at: "2026-08-26T00:00:00Z", history: [{ state: "submitted", at: "2026-08-26T00:00:00Z", actor: "test-agent" }] }
  };
  assert.equal(validateApplication(base, "app_test_agent_0001.json", termsSha256), true);
  assert.throws(() => validateApplication({ ...base, pilot: { ...base.pilot, external_side_effects: true } }, "app_test_agent_0001.json", termsSha256), /external_side_effects/);
  assert.throws(() => validateApplication({ ...base, application_is_acceptance: true }, "app_test_agent_0001.json", termsSha256), /never an Acceptance/);
});
