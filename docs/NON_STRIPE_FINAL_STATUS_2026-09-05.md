# AccordTrace non-Stripe final status — 2026-09-05

This record captures the **verified input production baseline** used to prepare the non-Stripe freeze before the separate Stripe secret-activation step. The merge commit produced by this freeze will supersede the SHA below; after merge, the latest successful exact-SHA deploy, production smoke and live-contract workflows are the authoritative current-runtime truth. Repository readiness, production deployment, live protocol checks and third-party distribution state are kept separate.

## Verified input baseline before freeze merge

- Verified production release SHA: `58d93a3a2fadb82d6e893e499944bd8d1e678f89`
- Service: `https://accordtrace.notary-labs.workers.dev`
- AccordTrace version: `0.2.1`
- A2A: `1.0`
- MCP Registry: `io.github.Kosta1985/accord-trace`
- Canonical Agent Card skills: 8
- Worker: `cloudflare/src/worker-v2.js`
- D1 migration floor: 21

## Verified production runs on the input baseline

All of the following ran against the same verified input production SHA above and completed successfully:

- main CI #858 — run `33941050493`
- production deploy #57 — run `33941050505`
- production smoke #88 — run `33941074030`
- live contract #48 — run `33941074033`
- Agenstry discovery/validator #29 — run `33941074052`

## Live A2A contract proof

Live contract #48 called both supported A2A JSON-RPC methods on the deployed service:

- canonical: `message/send`
- compatibility: `SendMessage`

Both returned:

- HTTP 200
- JSON-RPC `2.0`
- no JSON-RPC error
- action `network_capabilities`
- model `single_level_direct_product_referral`
- Passport price `200` atomic cents (US$2)
- direct commission `100` atomic cents (US$1)
- cash payouts disabled

The live contract also requires both methods to return identical policy semantics. The release fails its post-deploy contract check if either method regresses.

## Current implemented non-Stripe product surface

### Evidence / interoperability

- REST proof creation, retrieval and verification
- MCP Streamable HTTP
- A2A 1.0 structured actions
- canonical and legacy Agent Card discovery routes
- OpenAPI and agent-readable discovery
- current 8-skill Agent Card
- free proof fallback through service-recorded hash when issuer signing is intentionally unavailable

### Agent/network surface

- network capabilities and network statistics
- Agent Passport product capability discovery
- referral resolution
- one-level direct product-referral policy
- no self-referral
- no multilevel/downline commission
- referral state isolated from Trust/security validation
- cash affiliate payout execution disabled

### Security / control plane

- defensive incident timeline and summary
- hashed-bearer RBAC
- short-lived non-escalating operator sessions
- containment actions limited to customer-owned/customer-authorized infrastructure
- append-only chained operator audit receipts
- webhook, Slack webhook and customer HTTPS email-relay alert adapters
- bounded redacted outbound alert payloads
- HTTPS-only alert destinations
- HMAC signing where configured
- deduplicated outbox, bounded retry and dead-letter behavior
- retention controls that exempt append-only audit receipts

### Framework examples

Reproducible synthetic handoff/verification examples now cover:

- OpenAI Agents SDK
- OpenAI Responses hosted MCP
- Claude MCP connector
- LangChain / LangGraph
- CrewAI
- Microsoft AutoGen
- Google ADK-compatible A2A v1 SDK layer
- generic MCP
- generic A2A
- REST

Synthetic example requests opt out of AccordTrace usage telemetry and are not counted as adoption.

## Release gates now required by CI

`npm run release:audit` verifies, among other invariants:

- canonical host and version
- synchronized Agent Cards
- A2A 1.0
- all 8 current skills
- MCP Registry identity and Streamable HTTP transport
- no plaintext Stripe/signing secrets in Wrangler vars
- exact US$2 Passport Price binding
- US$1 direct-referral / one-level / no-downline policy
- control-plane alert adapter safety
- framework integration presence and CI gating
- migration-before-deploy ordering
- exact-SHA production verification
- public brand/hostname drift protection
- fail-closed commercial truth boundary
- dual live A2A method coverage and semantic equivalence

`npm run frameworks:audit` separately verifies the framework handoff examples and their safety boundary.

## Distribution state

AccordTrace-owned protocol work is current. External directories can still cache older metadata:

- Agenstry public page remains stale at four skills / `Live JSON-RPC 0` / ~80% even though current Agenstry validator workflow succeeds. Issue #14 remains open for third-party index convergence.
- Glama is indexed and healthy but its public tool snapshot can lag the canonical eight-skill card.
- A2A Registry is visible but has displayed older cached version/skill metadata.
- Cline and LobeHub submissions remain requests, not confirmed marketplace listings.

See `docs/DISTRIBUTION_STATUS_2026-09-05.md` for the detailed matrix.

## Intentionally open community/external work

These issues are not technical production blockers and should not be closed merely to make the issue count smaller:

- #14 — external Agenstry public index refresh
- #21 — legitimate free directory expansion
- #17 — public interoperability board
- #11 — agent-builder interoperability invitation
- #7 — 15-minute interoperability challenge
- #6 — public beta feedback
- #2 — good-first-issue cross-language conformance contribution

## Stripe boundary — intentionally deferred

Stripe commercial activation is tracked separately in #80 and is **not** part of this non-Stripe freeze.

The exact remaining production secrets are:

- `STRIPE_SECRET_KEY`
- `STRIPE_WEBHOOK_SECRET`
- `NOTARY_PRIVATE_JWK`

Do not put their values in source control, issues, logs or chat. Commercial checkout must remain fail-closed until the production capability reports `commercial_ready: true` and the real checkout/webhook/certificate/referral verification is completed.

Cash affiliate payouts remain disabled.

## Freeze decision

Outside Stripe activation and external/community work, the AccordTrace technical surface represented by this baseline is considered ready for today's final non-Stripe freeze only while all CI, exact-SHA deployment, production smoke and live-contract gates remain green. The freeze merge must run those gates again; its successful exact-SHA deployment supersedes the input baseline above. Any future change must preserve those gates rather than relying on this document as a static claim.
