# Stripe activation for AccordTrace

The Stripe adapter is deliberately disabled until production secrets and Stripe Price IDs are configured. Do not commit any Stripe secret to GitHub.

## Required production secrets / variables

- `STRIPE_SECRET_KEY` — server-side Stripe API key.
- `STRIPE_WEBHOOK_SECRET` — signing secret for the production webhook endpoint.
- `STRIPE_PRICE_DOMAIN_CONTROL` — Stripe Price ID for domain-control validation.
- `STRIPE_PRICE_PUBLISHER_VALIDATION` — Stripe Price ID for publisher validation.
- `STRIPE_PRICE_SECURITY_ASSESSMENT` — Stripe Price ID for security assessment.
- `PUBLIC_BASE_URL` — recommended canonical HTTPS AccordTrace origin.

Optional / future-facing:

- `STRIPE_PUBLISHABLE_KEY` — retained for future client-side or embedded Stripe features. Hosted Checkout does not require the browser to receive it.
- `STRIPE_API_VERSION` — set only when AccordTrace intentionally pins a tested Stripe API version.

## Production webhook

Configure Stripe to send the relevant Checkout events to:

`POST /api/v1/launch/stripe/webhook`

The Worker verifies the `Stripe-Signature` header against the **raw, unmodified request body** and the production webhook secret. It stores only the Stripe event ID/type for replay protection; the raw event body is not persisted.

Handled Checkout lifecycle events:

- `checkout.session.completed`
- `checkout.session.async_payment_succeeded`
- `checkout.session.async_payment_failed`
- `checkout.session.expired`

## Payment truth boundary

A browser redirect to `checkout-success.html` is never payment proof. Only a verified Stripe webhook can move an AccordTrace Stripe validation order to `paid`.

Even a paid Stripe order does **not** create public validation evidence. The subject Agent Passport must separately sign the validation request. This prevents a purchaser from attaching a paid validation order to somebody else's Passport without control of that Passport key.

## Checkout flow

1. Buyer selects an active validator product.
2. AccordTrace creates an internal `stpo_...` order.
3. AccordTrace creates a server-side hosted Stripe Checkout Session using the configured Stripe Price ID.
4. Browser is redirected to the Stripe-hosted Checkout URL.
5. Stripe sends a signed webhook.
6. AccordTrace verifies the webhook and, only when Stripe reports the payment as paid, marks the order `paid`.
7. The Agent Passport signs `accordtrace.validation.request.v1` binding the paid Stripe order to the Passport and subject reference.
8. AccordTrace creates the normal pending validation request.
9. A safety-qualified validator performs the assessment and signs `passed`, `failed`, or `inconclusive`.

Payment buys the assessment process, never a positive result.

## Before enabling real money

Run:

- `npm test`
- `npm run production:check`
- `npm run cf:prepare`
- `npm run smoke:production` after deployment

Verify `/api/v1/launch/stripe/capabilities` reports `commercial_ready: true` only after both Checkout and webhook configuration are present.
