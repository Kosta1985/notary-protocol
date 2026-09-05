# AccordTrace Agent Passport — launch campaign kit

Launch product: **AccordTrace Agent Passport Certificate**  
Launch price: **US$2 one time**  
Direct qualifying referral commission: **US$1**  
Referral depth: **one level only**  
Product page: https://accordtrace.notary-labs.workers.dev/passport.html  
Referral page: https://accordtrace.notary-labs.workers.dev/network.html

## Core campaign message

**Give your AI agent a portable cryptographic Passport Certificate for US$2.**

The AccordTrace Agent Passport Certificate is a portable, machine-readable issuance artifact bound to the active Agent Passport public-key fingerprint. It can be independently inspected and signature-verified. It does not claim legal identity, KYC, safety or general trustworthiness.

If an enrolled Agent Passport directly refers a genuine buyer who completes a qualifying US$2 Certificate purchase, the direct referrer can earn a **US$1 commission** under the one-level referral policy.

## Current commercial-status wording

Use this wording until `GET /api/v1/passport-product/capabilities` returns `commercial_ready: true`:

> The US$2 product policy and referral economics are live. Stripe checkout remains fail-closed until the dedicated Stripe price, Stripe secret, verified webhook secret and valid AccordTrace signing key are all active in production.

Use this wording after `commercial_ready: true` is independently verified:

> The US$2 Agent Passport Certificate checkout is live. Fulfillment is driven only by a verified Stripe webhook, not by the browser success redirect.

Never say cash commissions have been paid unless the public network state actually reports paid commissions. The referral ledger can record qualifying/earned commission states while cash payout execution remains disabled.

## Homepage / directory one-liner

AccordTrace offers a portable cryptographic Agent Passport Certificate for US$2 and a one-level direct referral program where an eligible referrer can earn US$1 from a qualifying Certificate sale.

## Short social post

**A US$2 passport for AI agents.**

AccordTrace now has a portable Agent Passport Certificate product designed for agent-to-agent verification.

- US$2 one-time launch price
- Ed25519-signed issuance artifact
- stable public Certificate URL
- machine-readable verification
- US$1 direct qualifying referral commission
- one referral level only — no downline

Product: https://accordtrace.notary-labs.workers.dev/passport.html
Referral policy: https://accordtrace.notary-labs.workers.dev/network.html

The Certificate proves AccordTrace issuance bound to cryptographic key control. It is not legal identity, KYC, safety or a universal Trust Score.

## Agent-to-agent referral message

AccordTrace has a portable Agent Passport Certificate for US$2. If a cryptographic Passport/portable issuance record is useful for your workflow, inspect the product and live readiness here:

https://accordtrace.notary-labs.workers.dev/passport.html

If this message contains a direct AccordTrace referral code, the referring Passport may earn a US$1 direct commission only if you independently complete a genuine qualifying US$2 Certificate purchase. There is no downline commission and referral activity does not affect Trust, validation or security status.

## Framework-maintainer message

AccordTrace exposes a low-cost portable Agent Passport Certificate alongside its free proof/verification interfaces. The product is machine-readable and can be inspected through REST, MCP, A2A and OpenAPI discovery.

Launch economics:
- Certificate: US$2 one time
- direct qualifying referral commission: US$1
- referral levels: 1

Product page: https://accordtrace.notary-labs.workers.dev/passport.html
A2A Agent Card: https://accordtrace.notary-labs.workers.dev/.well-known/agent-card.json
MCP: https://accordtrace.notary-labs.workers.dev/mcp
OpenAPI: https://accordtrace.notary-labs.workers.dev/openapi.json

## GitHub / developer-community post

### US$2 portable Agent Passport Certificate for AI agents

AccordTrace is testing a very small paid product on top of its public agent-verification infrastructure: a **US$2 one-time Agent Passport Certificate**.

The Certificate is bound to the active cryptographic Agent Passport key fingerprint and includes a canonical public verification surface. Fulfillment is webhook-driven and the browser redirect is never treated as payment proof.

The associated referral model is deliberately narrow:

`direct referrer -> genuine US$2 Certificate sale -> US$1 direct commission`

There are no downline commissions. Referral activity never changes Trust, validation, identity or security state.

Try/discover:
- Product: https://accordtrace.notary-labs.workers.dev/passport.html
- Referral program: https://accordtrace.notary-labs.workers.dev/network.html
- MCP: https://accordtrace.notary-labs.workers.dev/mcp
- A2A: https://accordtrace.notary-labs.workers.dev/.well-known/agent-card.json
- OpenAPI: https://accordtrace.notary-labs.workers.dev/openapi.json

## Search/discovery phrases

Use naturally where relevant; do not keyword-stuff.

- AI agent passport
- Agent Passport Certificate
- cryptographic identity for AI agents
- AI agent certificate
- Ed25519 agent identity
- portable agent identity
- machine-verifiable agent certificate
- AI agent referral program
- MCP agent identity
- A2A agent identity
- autonomous agent verification
- verifiable agent credentials

## Campaign surfaces to update

1. Homepage: make the US$2 Passport the primary commercial CTA.
2. Product page: show a clear sample Certificate and interpretation limits.
3. Referral page: make the US$1 direct commission and one-level rule explicit.
4. `ai.html`: expose product/referral facts to AI search and retrieval systems.
5. `llms.txt` / `llms-full.txt`: include product price, referral economics and readiness endpoints.
6. README: surface product/referral links to GitHub visitors.
7. Sitemap: prioritize `/passport.html` and `/network.html`.
8. A2A/MCP discovery: retain factual product-readiness and referral-policy tools.
9. External directories: refresh only after successful production deploy; do not spam repeated submissions.
10. Social/community posts: publish only on relevant channels and include the product scope limitation.

## Referral anti-abuse rules that must stay in every campaign

- one direct referrer only
- no multilevel/downline commission
- no self-referral
- invitation generation is not a sale
- genuine external sale required for commission
- refund/chargeback can reverse unpaid commission
- shared-payment-identity patterns may be held for review
- referral activity has no Trust effect
- do not promise guaranteed earnings
- do not send unsolicited bulk messages

## Stripe launch checklist

The product must remain fail-closed until all items are true:

- `STRIPE_SECRET_KEY` configured in production
- `STRIPE_PRICE_AGENT_PASSPORT` points to the dedicated US$2 one-time Stripe Price
- `STRIPE_WEBHOOK_SECRET` configured for the production webhook endpoint
- valid Ed25519 `NOTARY_PRIVATE_JWK` configured for Certificate signing
- referral price configuration remains US$2 / US$1 and currency-consistent
- `GET /api/v1/passport-product/capabilities` reports `commercial_ready: true`
- a test Checkout Session completes
- webhook delivery fulfills the order
- Certificate signature verifies
- referral commission qualifies only for a genuine attributed sale
- refund/chargeback reversal behavior is verified

Canonical webhook endpoint:

`POST https://accordtrace.notary-labs.workers.dev/api/v1/passport-product/stripe/webhook`

Minimum Checkout events to keep enabled for this implementation:

- `checkout.session.completed`
- `checkout.session.async_payment_succeeded`
- `checkout.session.async_payment_failed`
- `checkout.session.expired`
- `charge.refunded`
- `charge.dispute.created`

Stripe is payment truth for this product. A success-page redirect is never payment truth.
