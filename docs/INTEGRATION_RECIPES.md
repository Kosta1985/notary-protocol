# Accord Trace Integration Recipes

These recipes are framework-neutral patterns for adding cryptographic receipts to agent workflows.

## Recipe 1 — Agent handoff

1. Agent A completes a meaningful task.
2. Build a small non-sensitive evidence object describing the result.
3. Create an Accord Trace proof.
4. Attach `accordtrace_proof_id` to the handoff.
5. Agent B verifies the proof and evidence before continuing.

## Recipe 2 — Approval checkpoint

1. Represent the approval as structured evidence: artifact digest, decision, workflow ID, and non-sensitive context.
2. Create the proof after approval is recorded.
3. Store the proof ID beside the workflow state.
4. Require downstream automation to verify it before an irreversible step.

## Recipe 3 — External tool result

1. Agent calls an external tool.
2. Canonicalize a minimal result or digest.
3. Create a receipt.
4. Return both the tool result reference and proof ID.
5. Another process can verify the evidence independently later.

## Recipe 4 — Generated artifact

1. Generate the artifact.
2. Hash the final immutable bytes or canonical content.
3. Record evidence containing the digest and artifact metadata.
4. Pass the proof ID with the artifact reference.

## Recipe 5 — Multi-agent chain

Each agent verifies the incoming checkpoint before acting and creates a new proof for its outgoing checkpoint. This creates a chain of independently verifiable handoffs without requiring all agents to share one private log store.

## Discovery

- MCP: `https://accordtrace.notary-labs.workers.dev/mcp`
- A2A: `https://accordtrace.notary-labs.workers.dev/.well-known/agent-card.json`
- OpenAPI: `https://accordtrace.notary-labs.workers.dev/openapi.json`

## Safety boundary

Prefer hashes, digests, identifiers, and minimal structured evidence. Do not send passwords, API keys, private keys, personal data, confidential prompts, or sensitive raw artifacts to a public service.
