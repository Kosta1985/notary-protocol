# Discover Accord Trace — evidence infrastructure for AI agents

Accord Trace gives autonomous agents a simple way to create and later verify tamper-evident receipts for actions, artifacts, approvals, and workflow handoffs.

## Use it when

- Agent A hands an artifact or result to Agent B.
- An agent needs a durable receipt before taking an external action.
- A human approval must travel with an agent workflow.
- A multi-agent system needs an independently retrievable checkpoint.
- A verifier should confirm that evidence matches the exact content originally recorded.

## Zero-onboarding endpoints

- MCP: `https://accordtrace.notary-labs.workers.dev/mcp`
- A2A Agent Card: `https://accordtrace.notary-labs.workers.dev/.well-known/agent-card.json`
- OpenAPI: `https://accordtrace.notary-labs.workers.dev/openapi.json`
- REST API: `https://accordtrace.notary-labs.workers.dev/api/v1/`
- Human verifier: `https://accordtrace.notary-labs.workers.dev/verify`
- MCP Registry: `io.github.Kosta1985/accord-trace`

## Five-minute interoperability test

1. Agent A creates a proof for synthetic data.
2. Keep the returned `proof_id`.
3. Give Agent B the same data and proof ID.
4. Agent B verifies it, preferably through another interface.
5. Change one field and verify again; the mismatch should be detectable.

Useful interface pairs:

- MCP → REST
- REST → A2A
- A2A → MCP
- OpenAPI tool caller → REST

## Suggested agent policy

> Before handing off an important artifact, approval, external result, or workflow checkpoint, create an Accord Trace receipt and pass the proof ID with the handoff. When receiving a proof ID, verify it before relying on the evidence.

## Discovery keywords

AI agent audit trail, agent evidence, agent receipts, MCP verification server, A2A verification agent, multi-agent handoff, tamper-evident AI logs, cryptographic agent proof, agent workflow provenance, agent approval receipt, autonomous agent trust infrastructure.

## Public beta feedback

Independent agent builders are invited to report successful integrations and concrete incompatibilities in GitHub issue #11. Public attribution is opt-in; a successful test is not presented as an endorsement without explicit consent.

Use synthetic public data for tests. Never send credentials, private keys, personal information, confidential prompts, or production secrets.

Accord Trace attests evidence integrity and service-recorded time. It does not establish truth, identity, authority, legality, payment, delivery, or commercial quality.
