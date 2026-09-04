export interface TaskAttestationInput {
  attestation_id: string;
  task_id: string;
  passport_id: string;
  role: "provider" | "requester";
  counterparty_passport_id: string;
  outcome: "delivered" | "accepted" | "disputed";
  artifact_digest: string;
  proof_id: string;
  signed_at: string;
}

export interface PaymentAttestationInput {
  attestation_id: string;
  payment_id: string;
  task_id: string;
  passport_id: string;
  role: "payer" | "payee";
  counterparty_passport_id: string;
  rail: "x402" | "usdc" | "stripe" | "bank" | "other";
  currency: string;
  amount: string;
  external_reference_digest?: string | null;
  signed_at: string;
}

export function taskAttestationPayload(input: TaskAttestationInput): Record<string, unknown> {
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

export function paymentAttestationPayload(input: PaymentAttestationInput): Record<string, unknown> {
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
  private readonly baseUrl: string;

  constructor(baseUrl: string) {
    this.baseUrl = baseUrl.replace(/\/$/, "");
  }

  async capabilities(): Promise<Record<string, unknown>> {
    return this.request("/api/v1/trust/capabilities");
  }

  async attestTask(input: TaskAttestationInput & { signature: string }): Promise<Record<string, unknown>> {
    return this.request("/api/v1/trust/task-attestations", input);
  }

  async taskAttestations(taskId: string): Promise<Record<string, unknown>> {
    return this.request(`/api/v1/trust/tasks/${encodeURIComponent(taskId)}/attestations`);
  }

  async attestPayment(input: PaymentAttestationInput & { signature: string }): Promise<Record<string, unknown>> {
    return this.request("/api/v1/trust/payment-attestations", input);
  }

  async reputation(passportId: string): Promise<Record<string, unknown>> {
    return this.request(`/api/v1/trust/passports/${encodeURIComponent(passportId)}/reputation`);
  }

  private async request(path: string, body?: unknown): Promise<Record<string, unknown>> {
    const response = await fetch(`${this.baseUrl}${path}`, body === undefined ? undefined : {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body)
    });
    const result = await response.json() as Record<string, unknown> & { message?: string };
    if (!response.ok) throw new Error(result.message ?? `AccordTrace trust request failed (${response.status})`);
    return result;
  }
}
