const JSON_HEADERS = { "content-type": "application/json; charset=utf-8" };
const WINDOW_DAYS = 365;

export async function handleReputation(request, env, url = new URL(request.url)) {
  if (!url.pathname.startsWith("/api/v1/reputation/")) return null;

  if (request.method === "GET" && url.pathname === "/api/v1/reputation/capabilities") {
    return reply({
      service: "AccordTrace Reputation Integrity Graph",
      version: "0.1.0",
      features: [
        "counterparty_diversity",
        "evidence_age",
        "identity_attestor_concentration",
        "mutual_attestation_detection",
        "three_node_cycle_detection",
        "task_counterparty_concentration",
        "payment_counterparty_concentration",
        "task_payment_cluster_correlation",
        "reciprocal_service_order_detection",
        "dispute_aware_dimensions"
      ],
      output_model: "aggregated_signals_only",
      trust_score: null,
      release_rule: "Graph signals are review evidence, not proof of collusion or shared control. No public numeric Trust Score is emitted."
    });
  }

  const match = url.pathname.match(/^\/api\/v1\/reputation\/passports\/([^/]+)\/graph-signals$/);
  if (request.method === "GET" && match) {
    const passportId = decodeURIComponent(match[1]);
    const passport = await env.DB.prepare("SELECT id,status,created_at FROM agent_passports WHERE id=?1").bind(passportId).first();
    if (!passport) return reply({ error: "passport_not_found" }, 404);
    return reply({ reputation_integrity: await buildGraphSignals(env, passport) });
  }

  return reply({ error: "not_found" }, 404);
}

async function buildGraphSignals(env, passport) {
  const now = new Date();
  const nowIso = now.toISOString();
  const windowStart = new Date(now.getTime() - WINDOW_DAYS * 86400000).toISOString();
  const id = passport.id;

  const identity = await env.DB.prepare(`SELECT
      COUNT(*) AS active_attestations,
      COUNT(DISTINCT attestor_passport_id) AS distinct_attestors,
      MIN(issued_at) AS earliest_at
    FROM identity_attestations
    WHERE subject_passport_id=?1 AND status='active' AND expires_at>?2`).bind(id, nowIso).first();

  const identityTop = await env.DB.prepare(`SELECT attestor_passport_id,COUNT(*) AS interactions
    FROM identity_attestations
    WHERE subject_passport_id=?1 AND status='active' AND expires_at>?2
    GROUP BY attestor_passport_id ORDER BY interactions DESC,attestor_passport_id ASC LIMIT 1`).bind(id, nowIso).first();

  const mutual = await env.DB.prepare(`SELECT COUNT(DISTINCT a.attestor_passport_id) AS count
    FROM identity_attestations a
    JOIN identity_attestations b
      ON b.attestor_passport_id=a.subject_passport_id
      AND b.subject_passport_id=a.attestor_passport_id
    WHERE a.subject_passport_id=?1
      AND a.status='active' AND b.status='active'
      AND a.expires_at>?2 AND b.expires_at>?2`).bind(id, nowIso).first();

  const cycles = await env.DB.prepare(`SELECT COUNT(*) AS count FROM (
    SELECT DISTINCT a.attestor_passport_id AS node_a,b.subject_passport_id AS node_b
    FROM identity_attestations a
    JOIN identity_attestations b ON b.attestor_passport_id=a.subject_passport_id
    JOIN identity_attestations c
      ON c.attestor_passport_id=b.subject_passport_id
      AND c.subject_passport_id=a.attestor_passport_id
    WHERE a.subject_passport_id=?1
      AND b.subject_passport_id<>a.attestor_passport_id
      AND a.status='active' AND b.status='active' AND c.status='active'
      AND a.expires_at>?2 AND b.expires_at>?2 AND c.expires_at>?2
  )`).bind(id, nowIso).first();

  const taskStats = await env.DB.prepare(`WITH interactions AS (
    SELECT task_id,
      CASE WHEN passport_id=?1 THEN counterparty_passport_id ELSE passport_id END AS counterparty,
      MAX(CASE WHEN outcome='disputed' THEN 1 ELSE 0 END) AS disputed,
      MIN(created_at) AS first_seen
    FROM task_attestations
    WHERE (passport_id=?1 OR counterparty_passport_id=?1) AND created_at>=?2
    GROUP BY task_id,counterparty
  ) SELECT COUNT(*) AS interactions,COUNT(DISTINCT counterparty) AS counterparties,
      COALESCE(SUM(disputed),0) AS disputes,MIN(first_seen) AS earliest_at FROM interactions`).bind(id, windowStart).first();

  const taskTop = await env.DB.prepare(`WITH interactions AS (
    SELECT task_id,CASE WHEN passport_id=?1 THEN counterparty_passport_id ELSE passport_id END AS counterparty
    FROM task_attestations
    WHERE (passport_id=?1 OR counterparty_passport_id=?1) AND created_at>=?2
    GROUP BY task_id,counterparty
  ) SELECT counterparty,COUNT(*) AS interactions FROM interactions
    GROUP BY counterparty ORDER BY interactions DESC,counterparty ASC LIMIT 1`).bind(id, windowStart).first();

  const bilateralTasks = await env.DB.prepare(`SELECT COUNT(DISTINCT p.task_id) AS count
    FROM task_attestations p
    JOIN task_attestations r ON r.task_id=p.task_id
      AND r.passport_id=p.counterparty_passport_id
      AND r.counterparty_passport_id=p.passport_id
    WHERE p.role='provider' AND p.outcome='delivered'
      AND r.role='requester' AND r.outcome='accepted'
      AND (p.passport_id=?1 OR r.passport_id=?1)
      AND p.created_at>=?2 AND r.created_at>=?2`).bind(id, windowStart).first();

  const paymentStats = await env.DB.prepare(`WITH interactions AS (
    SELECT payment_id,
      CASE WHEN passport_id=?1 THEN counterparty_passport_id ELSE passport_id END AS counterparty,
      MIN(created_at) AS first_seen
    FROM payment_attestations
    WHERE (passport_id=?1 OR counterparty_passport_id=?1) AND created_at>=?2
    GROUP BY payment_id,counterparty
  ) SELECT COUNT(*) AS interactions,COUNT(DISTINCT counterparty) AS counterparties,
      MIN(first_seen) AS earliest_at FROM interactions`).bind(id, windowStart).first();

  const paymentTop = await env.DB.prepare(`WITH interactions AS (
    SELECT payment_id,CASE WHEN passport_id=?1 THEN counterparty_passport_id ELSE passport_id END AS counterparty
    FROM payment_attestations
    WHERE (passport_id=?1 OR counterparty_passport_id=?1) AND created_at>=?2
    GROUP BY payment_id,counterparty
  ) SELECT counterparty,COUNT(*) AS interactions FROM interactions
    GROUP BY counterparty ORDER BY interactions DESC,counterparty ASC LIMIT 1`).bind(id, windowStart).first();

  const bilateralPayments = await env.DB.prepare(`SELECT COUNT(DISTINCT a.payment_id) AS count
    FROM payment_attestations a
    JOIN payment_attestations b ON b.payment_id=a.payment_id
      AND b.passport_id=a.counterparty_passport_id
      AND b.counterparty_passport_id=a.passport_id
      AND b.task_id=a.task_id AND b.rail=a.rail AND b.currency=a.currency AND b.amount_text=a.amount_text
    WHERE a.role='payer' AND b.role='payee'
      AND (a.passport_id=?1 OR b.passport_id=?1)
      AND a.created_at>=?2 AND b.created_at>=?2`).bind(id, windowStart).first();

  const settlements = await env.DB.prepare(`SELECT COUNT(*) AS count,
      COUNT(DISTINCT CASE WHEN buyer_passport_id=?1 THEN seller_passport_id ELSE buyer_passport_id END) AS counterparties
    FROM service_orders
    WHERE (buyer_passport_id=?1 OR seller_passport_id=?1)
      AND payment_status='settlement_verified' AND created_at>=?2`).bind(id, windowStart).first();

  const reciprocalCommerce = await env.DB.prepare(`WITH counterparties AS (
    SELECT CASE WHEN buyer_passport_id=?1 THEN seller_passport_id ELSE buyer_passport_id END AS counterparty,
      SUM(CASE WHEN buyer_passport_id=?1 THEN 1 ELSE 0 END) AS as_buyer,
      SUM(CASE WHEN seller_passport_id=?1 THEN 1 ELSE 0 END) AS as_seller,
      COUNT(*) AS interactions
    FROM service_orders
    WHERE (buyer_passport_id=?1 OR seller_passport_id=?1)
      AND payment_status IN ('payment_authorized','settlement_verified','consumed') AND created_at>=?2
    GROUP BY counterparty
  ) SELECT COUNT(*) AS reciprocal_counterparties,COALESCE(MAX(interactions),0) AS max_interactions
    FROM counterparties WHERE as_buyer>0 AND as_seller>0`).bind(id, windowStart).first();

  const securityEvidence = await env.DB.prepare(`SELECT
      COUNT(DISTINCT CASE WHEN type='security_evaluator' THEN attestor_passport_id END) AS security_attestors
    FROM identity_attestations
    WHERE subject_passport_id=?1 AND status='active' AND expires_at>?2`).bind(id, nowIso).first();

  const securityEvents = await env.DB.prepare(`SELECT
      COUNT(*) AS events,
      SUM(CASE WHEN recommended_action IN ('restrict','isolate') THEN 1 ELSE 0 END) AS material_events,
      SUM(CASE WHEN proof_bound=1 AND recommended_action IN ('restrict','isolate') THEN 1 ELSE 0 END) AS proof_bound_material_events
    FROM security_events WHERE passport_id=?1 AND created_at>=?2`).bind(id, windowStart).first();

  const identityConcentration = concentrationSummary(
    Number(identity?.active_attestations ?? 0),
    Number(identity?.distinct_attestors ?? 0),
    Number(identityTop?.interactions ?? 0)
  );
  const taskConcentration = concentrationSummary(
    Number(taskStats?.interactions ?? 0),
    Number(taskStats?.counterparties ?? 0),
    Number(taskTop?.interactions ?? 0)
  );
  const paymentConcentration = concentrationSummary(
    Number(paymentStats?.interactions ?? 0),
    Number(paymentStats?.counterparties ?? 0),
    Number(paymentTop?.interactions ?? 0)
  );

  const circular = {
    mutual_attestor_relationships: Number(mutual?.count ?? 0),
    three_node_cycles: Number(cycles?.count ?? 0)
  };
  const correlation = correlatedClusterSignal({
    taskTotal: taskConcentration.interactions,
    taskTopShare: taskConcentration.top_counterparty_share,
    taskTop: taskTop?.counterparty ?? null,
    paymentTotal: paymentConcentration.interactions,
    paymentTopShare: paymentConcentration.top_counterparty_share,
    paymentTop: paymentTop?.counterparty ?? null
  });
  const graphSignals = signalSet({
    identityConcentration,
    taskConcentration,
    paymentConcentration,
    circular,
    correlation,
    reciprocalCounterparties: Number(reciprocalCommerce?.reciprocal_counterparties ?? 0)
  });

  const facts = {
    passport_age_days: ageDays(passport.created_at, now),
    identity: {
      active_attestations: Number(identity?.active_attestations ?? 0),
      distinct_attestors: Number(identity?.distinct_attestors ?? 0),
      evidence_age_days: ageDays(identity?.earliest_at, now),
      concentration: identityConcentration
    },
    tasks: {
      interactions: taskConcentration.interactions,
      distinct_counterparties: taskConcentration.distinct_counterparties,
      bilateral_accepted_tasks: Number(bilateralTasks?.count ?? 0),
      disputes: Number(taskStats?.disputes ?? 0),
      evidence_age_days: ageDays(taskStats?.earliest_at, now),
      concentration: taskConcentration
    },
    payments: {
      bilateral_claims: Number(bilateralPayments?.count ?? 0),
      settlement_verified_orders: Number(settlements?.count ?? 0),
      settlement_verified_counterparties: Number(settlements?.counterparties ?? 0),
      interactions: paymentConcentration.interactions,
      distinct_counterparties: paymentConcentration.distinct_counterparties,
      evidence_age_days: ageDays(paymentStats?.earliest_at, now),
      concentration: paymentConcentration
    },
    security: {
      independent_security_attestors: Number(securityEvidence?.security_attestors ?? 0),
      security_events: Number(securityEvents?.events ?? 0),
      material_events: Number(securityEvents?.material_events ?? 0),
      proof_bound_material_events: Number(securityEvents?.proof_bound_material_events ?? 0)
    },
    reciprocal_service_order_counterparties: Number(reciprocalCommerce?.reciprocal_counterparties ?? 0)
  };

  return {
    passport_id: id,
    passport_status: passport.status,
    generated_at: nowIso,
    observation_window_days: WINDOW_DAYS,
    trust_score: null,
    review_state: graphReviewState(facts, graphSignals),
    graph_signals: graphSignals,
    confidence_dimensions: confidenceDimensions(facts, graphSignals),
    evidence_facts: facts,
    limitations: [
      "A graph signal is not proof that Passports share an operator or are colluding.",
      "Cryptographic Passports prove key control, not legal identity or beneficial ownership.",
      "Independent-attestor counts can still be manipulated if attestor keys are compromised or controlled by one party.",
      "Bilateral payment attestations are claims unless the payment rail is independently settlement-verified.",
      "The public response is aggregated and intentionally omits counterparty identifiers and raw payment or credential data.",
      "No automatic ban, fund action, or numeric Trust Score is produced by this endpoint."
    ]
  };
}

export function concentrationSummary(interactions, distinctCounterparties, topInteractions) {
  const total = Math.max(0, Number(interactions) || 0);
  const distinct = Math.max(0, Number(distinctCounterparties) || 0);
  const top = Math.max(0, Math.min(total, Number(topInteractions) || 0));
  return {
    interactions: total,
    distinct_counterparties: distinct,
    top_counterparty_share: total ? round3(top / total) : null
  };
}

export function correlatedClusterSignal(input) {
  const sameTop = Boolean(input.taskTop && input.paymentTop && input.taskTop === input.paymentTop);
  const present = sameTop && input.taskTotal >= 3 && input.paymentTotal >= 3
    && Number(input.taskTopShare) >= 0.75 && Number(input.paymentTopShare) >= 0.75;
  return {
    present,
    basis: present ? "same_counterparty_dominates_task_and_payment_evidence" : "not_detected",
    threshold: "at least 3 task and 3 payment interactions with >=75% concentration in the same counterparty"
  };
}

export function signalSet(input) {
  const signals = [
    signal("circular_identity_attestations", input.circular.mutual_attestor_relationships > 0 || input.circular.three_node_cycles > 0,
      { mutual_relationships: input.circular.mutual_attestor_relationships, three_node_cycles: input.circular.three_node_cycles }),
    signal("identity_attestor_concentration", concentrationFlag(input.identityConcentration),
      { top_counterparty_share: input.identityConcentration.top_counterparty_share, distinct_attestors: input.identityConcentration.distinct_counterparties }),
    signal("task_counterparty_concentration", concentrationFlag(input.taskConcentration),
      { top_counterparty_share: input.taskConcentration.top_counterparty_share, distinct_counterparties: input.taskConcentration.distinct_counterparties }),
    signal("payment_counterparty_concentration", concentrationFlag(input.paymentConcentration),
      { top_counterparty_share: input.paymentConcentration.top_counterparty_share, distinct_counterparties: input.paymentConcentration.distinct_counterparties }),
    signal("correlated_task_payment_cluster", Boolean(input.correlation.present),
      { basis: input.correlation.basis }),
    signal("reciprocal_service_order_pattern", Number(input.reciprocalCounterparties) > 0,
      { reciprocal_counterparties: Number(input.reciprocalCounterparties) || 0 })
  ];
  return {
    present_count: signals.filter((item) => item.present).length,
    signals
  };
}

export function graphReviewState(facts, graphSignals) {
  const evidence = facts.identity.active_attestations + facts.tasks.interactions + facts.payments.interactions;
  if (evidence === 0) return "insufficient_data";
  if (graphSignals.present_count > 0) return "review_recommended";
  return "no_material_graph_signal_detected";
}

export function confidenceDimensions(facts, graphSignals) {
  const hasIdentityGraphCaution = hasSignal(graphSignals, "circular_identity_attestations") || hasSignal(graphSignals, "identity_attestor_concentration");
  const deliveryCaution = facts.tasks.disputes > 0 || hasSignal(graphSignals, "task_counterparty_concentration") || hasSignal(graphSignals, "correlated_task_payment_cluster");
  const paymentCaution = hasSignal(graphSignals, "payment_counterparty_concentration") || hasSignal(graphSignals, "correlated_task_payment_cluster");
  const securityCaution = facts.security.proof_bound_material_events > 0;

  return {
    identity: dimensionState(
      facts.identity.distinct_attestors >= 2 ? "supported" : facts.identity.distinct_attestors === 1 ? "developing" : "insufficient",
      hasIdentityGraphCaution,
      ["active independent-attestor evidence", "circularity and concentration checks"]
    ),
    security_posture: dimensionState(
      facts.security.independent_security_attestors >= 2 ? "supported" : facts.security.independent_security_attestors === 1 ? "developing" : "insufficient",
      securityCaution,
      ["independent security-evaluator attestations", "proof-bound material security events"]
    ),
    delivery_reliability: dimensionState(
      facts.tasks.bilateral_accepted_tasks >= 5 && facts.tasks.distinct_counterparties >= 3 ? "supported"
        : facts.tasks.bilateral_accepted_tasks > 0 ? "developing" : "insufficient",
      deliveryCaution,
      ["bilateral accepted tasks", "counterparty diversity", "disputes", "concentration"]
    ),
    payment_reliability: dimensionState(
      facts.payments.settlement_verified_orders >= 3 && facts.payments.settlement_verified_counterparties >= 3 ? "supported"
        : facts.payments.bilateral_claims > 0 ? "developing" : "insufficient",
      paymentCaution,
      ["settlement-verified orders where available", "bilateral payment claims", "counterparty diversity", "concentration"]
    )
  };
}

function dimensionState(base, caution, basis) {
  return {
    state: caution && base !== "insufficient" ? "caution" : base,
    underlying_evidence_state: base,
    basis,
    numeric_score: null
  };
}
function signal(code, present, evidence) { return { code, present: Boolean(present), evidence }; }
function hasSignal(set, code) { return Boolean(set.signals.find((item) => item.code === code)?.present); }
function concentrationFlag(summary) { return summary.interactions >= 4 && summary.top_counterparty_share !== null && summary.top_counterparty_share >= 0.8; }
function ageDays(value, now) { const time = Date.parse(value); return Number.isFinite(time) ? Math.max(0, Math.floor((now.getTime() - time) / 86400000)) : null; }
function round3(value) { return Math.round(value * 1000) / 1000; }
function reply(body, status = 200) { return new Response(JSON.stringify(body), { status, headers: JSON_HEADERS }); }
export class ReputationError extends Error { constructor(message, status = 400) { super(message); this.status = status; } }
