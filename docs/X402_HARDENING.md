# AccordTrace x402 Production Hardening

AccordTrace keeps x402 verification non-custodial and read-only. It delegates `/verify` to an explicitly configured external facilitator and does not call `/settle` or move funds.

## Production requirements

Set both of the following in Cloudflare only when verification should be enabled:

- `X402_VERIFY_ENABLED=true`
- `X402_FACILITATOR_URL=https://<trusted-facilitator>`

There is no default facilitator. When verification is enabled but the URL is absent or invalid, verification fails closed.

The facilitator URL must use HTTPS and must not contain userinfo, query parameters, or fragments. This avoids accidentally embedding API keys or other secrets in a URL that AccordTrace may persist as non-secret facilitator metadata.

## x402 V2 requirements

New hardened x402 orders require a CAIP-2 network identifier, for example `eip155:8453` rather than a legacy network nickname.

When an order is created, AccordTrace constructs its PaymentRequirements exactly once from signed order/offer data and stores both:

- canonical requirements JSON;
- SHA-256 requirements digest.

`maxTimeoutSeconds` is derived from the signed `ordered_at` and offer expiry, not from `Date.now()` during later verification. The same order therefore produces the same requirements digest on every verification attempt.

Legacy orders that do not have stored hardened requirements are rejected by the hardened verify route instead of silently recomputing different requirements.

## Facilitator preflight

Before `/verify`, AccordTrace checks the configured facilitator's `GET /supported` response. The selected combination must advertise:

- `x402Version: 2`;
- the requested scheme (`exact` for this release);
- the exact CAIP-2 network from the stored requirements.

The support result is cached for five minutes by facilitator digest, scheme, network and protocol version. The raw support document is not persisted; only a digest of normalized supported-kind metadata is stored.

## Replay protection

AccordTrace computes a canonical SHA-256 digest of the submitted payment payload after the buyer-signed verify request is authenticated.

That digest is atomically reserved in `x402_payment_payload_replays`:

- reuse for the same order is allowed for retry/idempotency;
- reuse for a different order is rejected with `payment_payload_replay_detected`;
- the raw payment payload is never stored.

This is an application-layer control in addition to replay defenses provided by the underlying x402 payment scheme/network.

## Payer privacy

A facilitator may return a payer address/reference in its verification response. AccordTrace does not store that raw value in `service_orders.payer_ref`.

Instead it stores:

`SHA-256("accordtrace.x402.payer.v1:" + payer_reference)`

in `payment_reference_digest` and explicitly clears `payer_ref`.

## Settlement and custody

A successful `/verify` changes only AccordTrace authorization state. It does not establish settlement truth and does not transfer funds.

Responses continue to state:

- `settlement_status: not_settled_by_accordtrace`
- `custody: none`

A future settlement-verification phase must remain external/non-custodial and must not reinterpret a successful `/verify` as proof of settlement.
