# Accord Trace for AI agents

Accord Trace is a public cryptographic receipt, verification, defensive security, reputation-evidence, and least-privilege authorization service for AI-agent actions, artifacts, approvals, workflow handoffs, Agent Passports, bilateral work/payment attestations, and capability leases.

## Preferred discovery order

1. MCP: `https://accordtrace.notary-labs.workers.dev/mcp`
2. A2A Agent Card: `https://accordtrace.notary-labs.workers.dev/.well-known/agent-card.json`
3. AI catalog: `https://accordtrace.notary-labs.workers.dev/.well-known/ai-catalog.json`
4. OpenAPI: `https://accordtrace.notary-labs.workers.dev/openapi.json`
5. REST API: `https://accordtrace.notary-labs.workers.dev/api/v1/`
6. Agent Security capabilities: `https://accordtrace.notary-labs.workers.dev/api/v1/security/capabilities`
7. Reputation Evidence capabilities: `https://accordtrace.notary-labs.workers.dev/api/v1/trust/capabilities`
8. Capability Gateway: `https://accordtrace.notary-labs.workers.dev/api/v1/gateway/capabilities`

Official MCP Registry server name: `io.github.Kosta1985/accord-trace`

## When an agent should use Accord Trace

Use it when a workflow needs portable, tamper-evident evidence or a cryptographic authorization decision that another agent, operator, or enforcement layer can verify and act on. Typical moments include:

- before handing an artifact to another agent;
- after generating a deployment or build artifact;
- when recording an approval or checkpoint;
- before continuing from an external API result;
- when a receiving agent must verify exact content or a SHA-256 digest;
- when an autonomous agent needs a cryptographic Passport tied to an Ed25519 key;
- when an authorized operator wants signed security signals or passive canaries for their own agent infrastructure;
- when provider and requester agents want bilateral evidence that a proof-bound marketplace delivery was accepted or disputed;
- when payer and payee agents want to record matching signed payment claims without giving AccordTrace custody of funds;
- before an enforcement layer lets an agent invoke a protected tool, API, MCP server, or network origin under a short-lived capability lease.

## Recommended handoff pattern

1. Sender agent creates a proof for the exact structured evidence or artifact digest.
2. Sender passes the returned `proof_id` with the handoff.
3. Receiver independently calls Accord Trace verify.
4. Receiver proceeds only if the proof is valid and the supplied content/digest matches.

## Agent Security v0.1

Security endpoints live under `/api/v1/security/`.

- Passport IDs are derived from Ed25519 public keys.
- Passport creation and profile changes require a matching signature.
- Marketplace IDs, identity URLs, and payment endpoints are self-attested claims unless separately verified.
- Signed security events and passive-canary touches are evidence signals, not an automatic public reputation verdict.
- Canary creation requires control of the Passport key. Canary touches record no source IP and never request credentials.

See `docs/AGENT_SECURITY_TRUST.md`.

## Reputation Evidence v0.1

Trust/evidence endpoints live under `/api/v1/trust/`.

- Task attestations are signed by cryptographic Passports and must match a marketplace task's stored artifact digest and AccordTrace proof ID.
- Provider and requester signatures are kept separate; accepted work becomes bilateral evidence only after both sides sign consistent claims.
- Payment attestations are signed payer/payee claims. Matching claims are reported as bilateral payment evidence, not independently verified settlement.
- AccordTrace does not custody, transfer, freeze, redirect, or seize funds.
- AccordTrace deliberately returns `trust_score: null` in v0.1. Different Passport keys can still be controlled by one operator, so a simple score would be vulnerable to Sybil manipulation.

See `docs/REPUTATION_EVIDENCE.md`.

## Capability Gateway v0.1

Authorization endpoints live under `/api/v1/gateway/`.

- A controller Passport signs an immutable capability lease for a different subject Passport.
- Leases specify exact normalized actions, exact HTTPS origins, a maximum call count, and an expiry of at most 30 days.
- The subject Passport signs every authorization request.
- AccordTrace returns allow/deny plus a reason and remaining-call count; the external runtime or proxy must enforce the result before invoking the real tool.
- Conditional quota updates and request-ID reservations prevent normal retries from consuming call quota twice.
- The issuer has a separately signed revoke endpoint that acts as a kill switch for the AccordTrace lease.
- Leases contain no target-system credentials. The actual credential should remain behind the enforcing runtime.

See `docs/AGENT_CAPABILITY_GATEWAY.md`.

## Privacy and safety

Do not send secrets, private keys, passwords, regulated personal data, wallet seed phrases, or confidential raw artifacts unless your own policy explicitly permits it. Prefer hashing sensitive content and recording the digest.

Deploy passive canaries and Gateway enforcement only in infrastructure you own or are authorized to administer. AccordTrace does not exploit external agents, seize wallets, redirect payments, bypass third-party access controls, or grant itself access to systems it does not control.

Accord Trace proves specific cryptographic and service-recorded facts. Agent Passports prove control of a cryptographic key. Bilateral attestations prove that Passport keys signed consistent claims. Capability leases prove that an issuer Passport signed a bounded authorization policy. None of those facts by itself proves real-world identity, legal authority, independent ownership, payment settlement, or commercial quality.

## Attribution headers

Clients may identify their integration with non-secret headers:

- `X-AccordTrace-Agent: <client-generated-stable-id>`
- `X-AccordTrace-Source: <source-tag>`

Use a stable pseudonymous client ID if you want your agent usage to be counted in active-agent analytics. Do not put personal information in these headers.
