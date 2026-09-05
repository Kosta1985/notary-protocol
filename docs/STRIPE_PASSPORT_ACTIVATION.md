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
- Read-only commercial readiness probe is deployed in `.github/workflows/passport-commercial-readiness.yml`
- Manual isolated hosted-Checkout verification is defined in `.github/workflows/passport-stripe-sandbox-e2e.yml`

## Secrets that must never enter source control

The production Worker remains fail-closed until Stripe credentials and a cryptographically verified issuer are available, AND the explicit `PASSPORT_CHECKOUT_ENABLED` gate is enabled after sandbox validation:

1. `STRIPE_SECRET_KEY`
   - Prefer a least-privilege live restricted Stripe API key when the required Checkout permissions are available.
   - Never place the key in `wrangler.jsonc`, GitHub source, issue text, logs, or D1.

2. `STRIPE_WEBHOOK_SECRET`
   - Use the signing secret for the production Agent Passport webhook endpoint.
   - Never use a browser success redirect as proof of payment.

3. `NOTARY_PRIVATE_JWK`
   - Preferred explicit Ed25519 private JWK for AccordTrace Certificate issuance.
   - If it is absent, `PASSPORT_USE_PROOF_SIGNER=true` explicitly permits use of the existing `PROOF_SIGNING_PRIVATE_JWK` binding for Passport routes only. The configured `PROOF_SIGNING_PUBLIC_JWK`, when present, must match.
   - The runtime imports the key and performs an Ed25519 sign/verify self-test. Malformed explicit primary keys never fall back to another signer. No secret is copied, rotated, logged or exported by this path.
   - `certificate_signer` in the capabilities response contains only the source binding name, a reason code and the public-key fingerprint.
   - Generate it outside source control and keep a secure recovery copy before activation.
   - The public key may be published; the private JWK must remain a Worker secret.

## Activation hold (2026-09-05)

The read-only Cloudflare preflight confirmed that `NOTARY_PRIVATE_JWK` is absent,
while `PROOF_SIGNING_PRIVATE_JWK` and `PROOF_SIGNING_PUBLIC_JWK` are encrypted
bindings. There were no Certificate orders or issued Certificates at that check.
The optional compatibility binding is enabled, but `PASSPORT_CHECKOUT_ENABLED`
remains `false`. A usable signer is a prerequisite, NOT evidence of a completed
Stripe payment. The separate activation hold must not be bypassed by a UI change.

## Required sandbox isolation

Use a separate Worker, D1 database, issuer key and Stripe sandbox credentials.
Never point a sandbox destination at the production webhook or send a simulated
paid event to production. `sk_test_`/`rk_test_` credentials and `event.livemode=false`
are required for sandbox traffic. Production uses matching live credentials and
`event.livemode=true`. The handler rejects mismatched event modes before ledger writes.

The isolated SQLite tests in `test/passport-commerce-runtime.test.js` use generated
keys and stub all Stripe requests. They exercise signed Checkout creation, raw-body
HMAC, certificate signatures, duplicate deliveries, incorrect sessions/metadata,
price/currency rejection, asynchronous payments, refunds, disputes and out-of-order
reversals. They are NOT a substitute for an actual hosted Checkout sandbox run.
Do not use real card details or a real charge for testing.

### Manual hosted Stripe sandbox E2E

Run the GitHub Actions workflow `Passport Stripe isolated sandbox e2e` only after these
repository secrets exist:

- `STRIPE_TEST_SECRET_KEY` — must start with `sk_test_` or `rk_test_`. If a restricted
  key is used, it must be allowed to read the test Price, create Checkout Sessions,
  and create/delete temporary webhook endpoints.
- `STRIPE_TEST_PRICE_AGENT_PASSPORT` — a Stripe test-mode Price id for an active,
  one-time US$2.00 USD Price.
- Existing Cloudflare deployment credentials accepted by the workflow.

The workflow deliberately does not require or reuse the production webhook signing
secret. It creates a temporary Stripe **test-mode** webhook endpoint bound only to a
run-specific temporary Worker, receives the endpoint's `whsec_...` value directly from
Stripe, installs it only on that temporary Worker, and deletes the endpoint during
cleanup.

For every run it creates a fresh temporary Worker, D1 database, issuer key, three
throwaway Passports, one direct referral attribution, and two hosted Checkout Sessions:
one referred purchase and one unattributed purchase. Chromium completes the real
Stripe-hosted test Checkout with Stripe's test card; no live card or real funds are used.
The success redirect is accepted only when it returns to the run-specific Worker.

The run must prove all of the following before it passes:

- the Stripe Price itself is `livemode=false`, active, one-time, exactly 200 cents USD;
- the temporary Passport service reports all commercial gates ready;
- both Checkout Session ids are `cs_test_...`;
- fulfillment occurs through the verified Stripe webhook, not the browser redirect;
- two signed Agent Passport Certificates are issued and their issuer signatures verify;
- the referred purchase creates exactly one US$1 direct qualifying commission;
- the unattributed purchase creates no additional commission;
- cash affiliate payouts remain disabled;
- the temporary Stripe webhook, Worker, D1 database and ephemeral private-key files are
  removed by cleanup.

The workflow archives only sanitized audit evidence for seven days. Private Passport
keys, the ephemeral issuer key, Stripe secret keys and webhook signing secrets are not
included in the artifact.

Passing this workflow is evidence that the isolated test flow works. It does **not**
automatically enable production checkout and it never changes the production
`PASSPORT_CHECKOUT_ENABLED` value.

After the actual sandbox run passes, enable `PASSPORT_CHECKOUT_ENABLED=true` through
a reviewed configuration deployment. Keep cash affiliate payouts disabled.

## Read-only activation probe

Run:

```bash
node scripts/passport-commercial-readiness.mjs https://accordtrace.notary-labs.workers.dev
```

The probe never creates a Checkout Session and never charges a payment method. It verifies:
- product id `agent_passport_certificate`
- exact price: 200 atomic cents / USD
- referral pricing consistency
- `checkout_enabled`
- `webhook_enabled`
- `certificate_signing_enabled`
- `commercial_ready`
- `cash_affiliate_payouts_enabled: false`

It fails only on policy/economics drift. Missing activation gates are reported as `activation_pending` so the integration remains safely fail-closed while secrets are being installed.

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
