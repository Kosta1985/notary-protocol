# Accord Trace for AI agents

Accord Trace is a public cryptographic receipt and verification service for AI-agent actions, artifacts, approvals, and workflow handoffs.

## Preferred discovery order

1. MCP: `https://accordtrace.notary-labs.workers.dev/mcp`
2. A2A Agent Card: `https://accordtrace.notary-labs.workers.dev/.well-known/agent-card.json`
3. OpenAPI: `https://accordtrace.notary-labs.workers.dev/openapi.json`
4. REST API: `https://accordtrace.notary-labs.workers.dev/api/v1/`

Official MCP Registry server name: `io.github.Kosta1985/accord-trace`

## When an agent should use Accord Trace

Use it when a workflow needs a portable, tamper-evident receipt that another agent or operator can verify independently later. Typical moments include:

- before handing an artifact to another agent;
- after generating a deployment or build artifact;
- when recording an approval or checkpoint;
- before continuing from an external API result;
- when a receiving agent must verify exact content or a SHA-256 digest.

## Recommended handoff pattern

1. Sender agent creates a proof for the exact structured evidence or artifact digest.
2. Sender passes the returned `proof_id` with the handoff.
3. Receiver independently calls Accord Trace verify.
4. Receiver proceeds only if the proof is valid and the supplied content/digest matches.

## Privacy and safety

Do not send secrets, private keys, passwords, regulated personal data, or confidential raw artifacts unless your own policy explicitly permits it. Prefer hashing sensitive content and recording the digest.

Accord Trace proves evidence integrity and service-recorded time. It does not prove truth, identity, authority, legality, payment, delivery, or commercial quality.

## Attribution headers

Clients may identify their integration with non-secret headers:

- `X-AccordTrace-Agent: <client-generated-stable-id>`
- `X-AccordTrace-Source: <source-tag>`

Use a stable pseudonymous client ID if you want your agent usage to be counted in active-agent analytics. Do not put personal information in these headers.
