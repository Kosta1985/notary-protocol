# AccordTrace Agent Passport Certificate product

## Product boundary

AccordTrace keeps cryptographic Agent Passport key registration available independently of the affiliate program. The commercial US$2 product is the **AccordTrace Agent Passport Certificate**: a portable, AccordTrace-signed issuance artifact bound to an active cryptographic Agent Passport.

This separation is intentional:

- a customer does not pay for the right to join the affiliate program;
- affiliate enrollment remains optional and separate;
- the US$2 purchase buys a standalone portable certificate artifact;
- a direct referral commission, when applicable, is tied to this genuine product purchase rather than to recruitment alone.

## What the US$2 product delivers

After a verified qualifying payment, AccordTrace issues one signed certificate containing:

- certificate schema/version;
- certificate ID;
- Agent Passport ID;
- Passport public-key SHA-256 fingerprint;
- product ID and product version;
- issue timestamp;
- canonical public certificate URL;
- certificate verification endpoint;
- AccordTrace Ed25519 issuer public key and signature.

The certificate can be stored by the agent, attached to agent metadata, linked from a public profile, or independently signature-verified later.

The certificate does **not** claim:

- legal identity;
- human identity;
- KYC status;
- safety;
- general trustworthiness;
- successful validation;
- payment reliability;
- authorization to act for another person or company.

It proves only that AccordTrace issued the certificate for the stated active cryptographic Passport after the product order reached the required paid state.

## Price

Launch price: **US$2.00**.

The Stripe Price ID is deployment configuration. Code must not rely on a browser-supplied amount or Price ID.

## Purchase flow

1. An active cryptographic Passport signs a checkout request.
2. The request optionally references an already-reserved direct referral attribution.
3. AccordTrace creates a dedicated Passport Certificate order.
4. AccordTrace creates Stripe Checkout server-side using the configured Passport Certificate Price ID.
5. The customer completes payment on Stripe.
6. A verified Stripe webhook is the only source of payment truth.
7. AccordTrace records the paid state idempotently.
8. AccordTrace creates and stores a signed portable Passport Certificate.
9. If a valid direct referral attribution was attached, the verified paid order may qualify exactly one direct referral commission through the existing affiliate ledger.
10. Refund/chargeback events invalidate the commercial fulfillment state and reverse any unpaid referral commission associated with the order.

A Checkout success redirect is never proof of payment and never qualifies a referral commission.

## Referral boundary

Referral handling remains one level only.

If A directly refers B and B purchases a qualifying Certificate:

- A may earn the configured direct commission after settlement and maturity.
- B may separately enroll as an affiliate.
- if B later refers C, B may earn on C's direct qualifying purchase.
- A receives no commission from C.

The paid Certificate is not required merely to enroll in the affiliate program. An active cryptographic Passport may enroll separately under the affiliate terms.

## Order state

Suggested order lifecycle:

`created -> pending -> paid -> fulfilled`

Exceptional terminal/repair states:

- `failed`
- `refunded`
- `chargeback`

The database must enforce valid states.

## Certificate state

Certificate state is independent of Trust or validation.

Suggested states:

- `active`
- `refunded`
- `revoked`

A commercial refund may mark the product certificate `refunded`, but it must not delete historical evidence. Revocation/refund history should remain auditable.

## Privacy

Do not store raw card data, payment method credentials, private keys, source IP addresses or Stripe webhook bodies.

Store only the minimum Stripe references required for reconciliation, such as:

- Checkout Session ID;
- PaymentIntent ID;
- Stripe Customer ID when provided;
- Stripe event ID/type;
- amount/currency;
- timestamps.

Affiliate shared-payment-identity analysis should use a one-way digest inside the affiliate system rather than publishing raw Stripe customer identifiers.

## Security

- checkout request must be signed by the active Passport key;
- request IDs must be replay protected;
- configured Price ID only;
- fixed HTTPS success/cancel URLs;
- Stripe webhook HMAC verification before JSON processing;
- webhook idempotency;
- one initial qualifying Certificate sale per Passport for referral commission purposes;
- no self-referral;
- no commission from browser redirects;
- no commission from validation-product orders;
- issuer signing key remains server-side only;
- certificate signature is Ed25519 and independently verifiable.

## Machine-readable surfaces

Planned API:

- `GET /api/v1/passport-product/capabilities`
- `POST /api/v1/passport-product/checkout`
- `POST /api/v1/passport-product/stripe/webhook`
- `GET /api/v1/passport-product/orders/{order_id}`
- `GET /api/v1/passport-product/certificates/{certificate_id}`
- `POST /api/v1/passport-product/certificates/verify`

The API should state clearly whether checkout, webhook fulfillment and affiliate cash payouts are actually enabled in the deployment.

## Launch gates

Do not accept production payment until all of these are true:

- Stripe secret key configured;
- dedicated Passport Certificate Stripe Price ID configured at US$2 launch price;
- webhook secret configured;
- AccordTrace issuer signing key configured;
- production D1 migration applied;
- webhook and certificate tests passing;
- refund/chargeback reconciliation tested;
- affiliate settlement linkage tested;
- public terms/privacy wording updated;
- Australian legal review completed for live referral-payment marketing and payout activation.

Cash affiliate payout remains a separate later gate even when Certificate checkout itself is enabled.
