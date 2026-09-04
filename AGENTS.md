# Accord Trace for AI agents

Accord Trace is a public cryptographic receipt, verification, and defensive trust service for AI-agent actions, artifacts, approvals, workflow handoffs, and cryptographic Agent Passports.

## Preferred discovery order

1. MCP: `https://accordtrace.notary-labs.workers.dev/mcp`
2. A2A Agent Card: `https://accordtrace.notary-labs.workers.dev/.well-known/agent-card.json`
3. AI catalog: `https://accordtrace.notary-labs.workers.dev/.well-known/ai-catalog.json`
4. OpenAPI: `https://accordtrace.notary-labs.workers.dev/openapi.json`
5. REST API: `https://accordtrace.notary-labs.workers.dev/api/v1/`
6. Agent Security capabilities: `https://accordtrace.notary-labs.workers.dev/api/v1/security/capabilities`

Official MCP Registry server name: `io.github.Kosta1985/accord-trace`

## When an agent should use Accord Trace

Use it when a workflow needs a portable, tamper-evident receipt that another agent or operator can verify independently later. Typical moments include:

- before handing an artifact to another agent;
- after generating a deployment or build artifact;
- when recording an approval or checkpoint;
- before continuing from an external API result;
- when a receiving agent must verify exact content or a SHA-256 digest;
- when an autonomous agent needs a cryptographic Passport tied to an Ed25519 key;
- when an authorized operator wants signed security signals or passive canaries for their own agent infrastructure.

## Recommended handoff pattern

1. Sender agent creates a proof for the exact structured evidence or artifact digest.
2. Sender passes the returned `proof_id` with the handoff.
3. Receiver independently calls Accord Trace verify.
4. Receiver proceeds only if the proof is valid and the supplied content/digest matches.

## Agent Security & Trust v0.1

Security endpoints live under `/api/v1/security/`.

- Passport IDs are derived from Ed25519 public keys.
- Passport creation and profile changes require a matching signature.
- Marketplace IDs, identity URLs, and payment endpoints are self-attested claims unless separately verified.
- Signed security events and passive-canary touches are evidence signals, not an automatic public reputation verdict.
- AccordTrace deliberately returns `trust_score: null` in v0.1 rather than publishing a gameable score.
- Canary creation requires control of the Passport key. Canary touches record no source IP and never request credentials.

See `docs/AGENT_SECURITY_TRUST.md` for signed payload formats and the reputation roadmap.

## Privacy and safety

Do not send secrets, private keys, passwords, regulated personal data, wallet seed phrases, or confidential raw artifacts unless your own policy explicitly permits it. Prefer hashing sensitive content and recording the digest.

Deploy passive canaries only in infrastructure you own or are authorized to test. AccordTrace does not exploit external agents, seize wallets, redirect payments, or grant itself access to third-party systems.

Accord Trace proves evidence integrity and service-recorded time. Agent Passports prove control of a cryptographic key. Neither feature by itself proves real-world identity, authority, legality, payment ownership, delivery, or commercial quality.

## Attribution headers

Clients may identify their integration with non-secret headers:

- `X-AccordTrace-Agent: <client-generated-stable-id>`
- `X-AccordTrace-Source: <source-tag>`

Use a stable pseudonymous client ID if you want your agent usage to be counted in active-agent analytics. Do not put personal information in these headers.
