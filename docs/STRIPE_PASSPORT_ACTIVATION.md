# AccordTrace Agent Passport — Stripe production activation

This runbook covers the final secure activation of the US$2 Agent Passport Certificate checkout.

## Already configured

- Stripe Product: `AccordTrace Agent Passport Certificate`
- Live one-time Price: `price_1UC8x6L1V4ptaCD2i8kiwoPF` (US$2.00)
- Production webhook endpoint: `/api/v1/passport-product/stripe/webhook`
- Required webhook events are subscribed
- `STRIPE_PRICE_AGENT_PASSPORT` is deployed as a non-secret Worker variable
- Referral economics are fixed at US$1 direct qualifying commission, one level only
- Cash payouts remain disabled

## Secrets that must never enter source control

The production Worker remains fail-closed until all three secrets below are configured in Cloudflare:

1. `STRIPE_SECRET_KEY`
   - Prefer a least-privilege live restricted Stripe API key when the required Checkout permissions are available.
   - Never place the key in `wrangler.jsonc`, GitHub source, issue text, logs, or D1.

2. `STRIPE_WEBHOOK_SECRET`
   - Use the signing secret for the production Agent Passport webhook endpoint.
   - Never use a browser success redirect as proof of payment.

3. `NOTARY_PRIVATE_JWK`
   - Dedicated Ed25519 private JWK for AccordTrace Certificate issuance.
   - Generate it outside source control and keep a secure recovery copy before activation.
   - The public key may be published; the private JWK must remain a Worker secret.

## Current production baseline

- Production release SHA: `0c46528d26ef1cee2a03994decdb818474e191f7`
- Production readiness reports `stripe_price_configured: true`.
- Full production smoke passes, including exact release SHA verification.
- Checkout remains intentionally disabled while the three secrets above are absent.

## Activation verification

Do not announce checkout as live until all of the following pass:

1. `GET /api/v1/passport-product/capabilities` returns `commercial_ready: true`.
2. A hosted Stripe Checkout Session is created for exactly the configured US$2 Price.
3. A completed payment is fulfilled only after a valid Stripe webhook.
4. A canonical Agent Passport Certificate is created.
5. Its Ed25519 issuer signature verifies through the public verification path.
6. A valid direct referral produces exactly a US$1 qualifying commission ledger state.
7. An unattributed purchase produces no referral commission.
8. Self-referral remains rejected.
9. Refund/dispute handling reverses unpaid commission state while preserving evidence.
10. Cash payout execution remains disabled.

## Truth boundary

Until the above smoke passes, public copy may say the US$2 product and US$1 direct referral program are configured, but must not say that checkout or cash payouts are live.
