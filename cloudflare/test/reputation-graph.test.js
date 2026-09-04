import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { concentrationSummary, correlatedClusterSignal, signalSet, graphReviewState, confidenceDimensions } from "../src/reputation.js";

const source = await readFile(new URL("../src/reputation.js", import.meta.url), "utf8");

test("concentration flags passport-farm style repeated counterparties without assigning guilt", () => {
  const summary = concentrationSummary(10, 2, 9);
  assert.equal(summary.top_counterparty_share, 0.9);
  const signals = signalSet({
    identityConcentration: concentrationSummary(5, 1, 5),
    taskConcentration: summary,
    paymentConcentration: concentrationSummary(8, 2, 7),
    circular: { mutual_attestor_relationships: 0, three_node_cycles: 0 },
    correlation: { present: false, basis: "not_detected" },
    reciprocalCounterparties: 0
  });
  assert.equal(signals.signals.find((x) => x.code === "task_counterparty_concentration").present, true);
  assert.equal(signals.signals.find((x) => x.code === "payment_counterparty_concentration").present, true);
});

test("circular reputation detects mutual and three-node identity cycles", () => {
  const signals = signalSet({
    identityConcentration: concentrationSummary(3, 3, 1),
    taskConcentration: concentrationSummary(0, 0, 0),
    paymentConcentration: concentrationSummary(0, 0, 0),
    circular: { mutual_attestor_relationships: 1, three_node_cycles: 2 },
    correlation: { present: false, basis: "not_detected" },
    reciprocalCounterparties: 0
  });
  const circular = signals.signals.find((x) => x.code === "circular_identity_attestations");
  assert.equal(circular.present, true);
  assert.deepEqual(circular.evidence, { mutual_relationships: 1, three_node_cycles: 2 });
});

test("correlated task and payment concentration detects collusion-like cluster pattern", () => {
  const signal = correlatedClusterSignal({
    taskTotal: 8,
    taskTopShare: 0.875,
    taskTop: "passport-b",
    paymentTotal: 7,
    paymentTopShare: 0.857,
    paymentTop: "passport-b"
  });
  assert.equal(signal.present, true);
});

test("correlation does not fire on sparse evidence or different counterparties", () => {
  assert.equal(correlatedClusterSignal({ taskTotal: 2, taskTopShare: 1, taskTop: "b", paymentTotal: 2, paymentTopShare: 1, paymentTop: "b" }).present, false);
  assert.equal(correlatedClusterSignal({ taskTotal: 5, taskTopShare: 1, taskTop: "b", paymentTotal: 5, paymentTopShare: 1, paymentTop: "c" }).present, false);
});

test("review state is insufficient without evidence and review recommended when signals exist", () => {
  const emptyFacts = { identity: { active_attestations: 0 }, tasks: { interactions: 0 }, payments: { interactions: 0 } };
  assert.equal(graphReviewState(emptyFacts, { present_count: 0, signals: [] }), "insufficient_data");
  const facts = { identity: { active_attestations: 1 }, tasks: { interactions: 3 }, payments: { interactions: 3 } };
  assert.equal(graphReviewState(facts, { present_count: 1, signals: [] }), "review_recommended");
});

test("confidence dimensions remain categorical and never emit a numeric trust score", () => {
  const facts = {
    identity: { distinct_attestors: 2 },
    security: { independent_security_attestors: 2, proof_bound_material_events: 0 },
    tasks: { bilateral_accepted_tasks: 6, distinct_counterparties: 4, disputes: 0 },
    payments: { settlement_verified_orders: 4, settlement_verified_counterparties: 3, bilateral_claims: 4 }
  };
  const graphSignals = { present_count: 0, signals: [] };
  const dimensions = confidenceDimensions(facts, graphSignals);
  assert.equal(dimensions.identity.state, "supported");
  assert.equal(dimensions.delivery_reliability.state, "supported");
  assert.equal(dimensions.payment_reliability.state, "supported");
  for (const dimension of Object.values(dimensions)) assert.equal(dimension.numeric_score, null);
  assert.doesNotMatch(source, /trust_score\s*:\s*\d+/);
});

test("public graph API is aggregated and documents non-punitive limitations", () => {
  assert.match(source, /aggregated_signals_only/);
  assert.match(source, /not proof.*collud/i);
  assert.match(source, /omits counterparty identifiers/);
  assert.match(source, /No automatic ban, fund action, or numeric Trust Score/);
  assert.doesNotMatch(source, /freezeFunds|seize|transferFrom|sendTransaction/);
});
