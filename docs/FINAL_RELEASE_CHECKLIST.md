# AccordTrace final release checklist

This checklist is the final pre-launch control for the current AccordTrace release. It intentionally separates code/protocol readiness from the postponed Stripe secret activation.

## Protocol and runtime

- [x] Production entrypoint is `cloudflare/src/worker-v2.js`.
- [x] A2A Agent Card advertises protocol version 1.0.
- [x] Agent Card and adapter copy stay synchronized.
- [x] Current Agent Card exposes eight public skills.
- [x] MCP transport is `streamable-http`.
- [x] MCP registry identity is `io.github.Kosta1985/accord-trace`.
- [x] AccordTrace discovery version is 0.2.1.
- [x] Production deploy applies D1 migrations before Worker deployment.
- [x] Production deploy stamps and verifies the exact release SHA.

## Evidence and safety

- [x] Free proof creation can fail safely to `service_recorded_hash` when an issuer signer is absent.
- [x] Issuer-signed proof mode is available only with a valid signer.
- [x] Malformed signing configuration fails closed for Passport Certificate issuance.
- [x] Browser redirects are never treated as payment truth.
- [x] Public evidence descriptions do not claim legal identity, authorship, authority, safety, legality, KYC, regulatory status, or general trustworthiness.
- [x] Public discovery contains no TaskBay brand drift or retired Worker host.
- [x] Secret values are not committed to Wrangler vars or source control.

## Agent-native discovery

- [x] REST/OpenAPI is published.
- [x] MCP discovery is published.
- [x] A2A discovery and Agent Card are published.
- [x] `llms.txt` and `llms-full.txt` are published.
- [x] Growth/read-only agent actions expose network capabilities, network statistics, Passport product readiness, and referral resolution.
- [x] Adoption playbooks cover research, coding/deployment, planner/executor, tool results, multi-agent chains, human approval, artifact provenance, and cross-framework handoffs.

## Usage telemetry

- [x] Modern counters distinguish proof creation/verification, MCP requests/tool calls, and A2A requests.
- [x] Synthetic and smoke traffic is excluded from real usage metrics.
- [x] Telemetry failure is best-effort and cannot interrupt the service path.
- [x] `/api/v1/stats` is the canonical modern stats alias while legacy compatibility is preserved.

## Agent Affiliate Network

- [x] Agent Passport Certificate launch price is US$2 one-time.
- [x] Direct qualifying referral commission is US$1.
- [x] Referral depth is one level only.
- [x] Self-referral is rejected.
- [x] Invitation generation is not represented as a sale or commission.
- [x] Referral activity cannot affect verification, validation, or Trust.
- [x] Refund/dispute logic can reverse unpaid referral state.
- [x] Cash payout execution remains disabled.

## Stripe activation — intentionally postponed

The following are **not** release-code failures. They are the final secure production activation boundary and must be completed later without putting secret material in GitHub or chat:

- [ ] Configure `STRIPE_SECRET_KEY` as a Cloudflare secret.
- [ ] Configure `STRIPE_WEBHOOK_SECRET` as a Cloudflare secret.
- [ ] Generate/secure the dedicated Ed25519 issuer key and configure `NOTARY_PRIVATE_JWK` as a Cloudflare secret.
- [ ] Confirm `/api/v1/passport-product/capabilities` returns `commercial_ready: true`.
- [ ] Run one end-to-end hosted Checkout purchase/fulfillment/certificate verification smoke.
- [ ] Verify exact US$1 direct referral ledger behavior in the live payment flow.

Until those items pass, the product may be described as configured at US$2 with a US$1 direct qualifying referral program, but checkout and cash payouts must not be described as live.

## One-command repository gate

Run:

```bash
npm run release:audit
```

A non-zero exit means the release invariants have drifted and the release should stop until the reported failure is corrected.
