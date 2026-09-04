export function taskAttestationPayload(input) {
  return {
    domain: "accordtrace.marketplace.task.attestation.v1",
    attestation_id: input.attestation_id,
    task_id: input.task_id,
    passport_id: input.passport_id,
    role: input.role,
    counterparty_passport_id: input.counterparty_passport_id,
    outcome: input.outcome,
    artifact_digest: input.artifact_digest,
    proof_id: input.proof_id,
    signed_at: input.signed_at
  };
}

export function paymentAttestationPayload(input) {
  return {
    domain: "accordtrace.payment.attestation.v1",
    attestation_id: input.attestation_id,
    payment_id: input.payment_id,
    task_id: input.task_id,
    passport_id: input.passport_id,
    role: input.role,
    counterparty_passport_id: input.counterparty_passport_id,
    rail: input.rail,
    currency: input.currency.trim().toUpperCase(),
    amount: input.amount,
    external_reference_digest: input.external_reference_digest ?? null,
    signed_at: input.signed_at
  };
}

export class AgentTrustClient {
  constructor(baseUrl) {
    this.baseUrl = baseUrl.replace(/\/$/, "");
  }

  async capabilities() {
    return this.request("/api/v1/trust/capabilities");
  }

  async attestTask(input) {
    return this.request("/api/v1/trust/task-attestations", input);
  }

  async taskAttestations(taskId) {
    return this.request(`/api/v1/trust/tasks/${encodeURIComponent(taskId)}/attestations`);
  }

  async attestPayment(input) {
    return this.request("/api/v1/trust/payment-attestations", input);
  }

  async reputation(passportId) {
    return this.request(`/api/v1/trust/passports/${encodeURIComponent(passportId)}/reputation`);
  }

  async request(path, body) {
    const response = await fetch(`${this.baseUrl}${path}`, body === undefined ? undefined : {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body)
    });
    const result = await response.json();
    if (!response.ok) throw new Error(result.message ?? `AccordTrace trust request failed (${response.status})`);
    return result;
  }
}
