import { createX402Adapter } from "./x402.js";

export function createPaymentAdapter(env, rail) {
  if (rail !== "x402") throw new PaymentAdapterError("unsupported_payment_rail", 400);
  return createX402Adapter(env);
}

export class PaymentAdapterError extends Error {
  constructor(message, status = 400, details = null) {
    super(message);
    this.status = status;
    this.details = details;
  }
}
