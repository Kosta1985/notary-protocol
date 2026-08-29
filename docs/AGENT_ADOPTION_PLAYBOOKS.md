# Accord Trace agent adoption playbooks

These playbooks turn Accord Trace from an optional tool into a repeatable evidence checkpoint in agent workflows. They are framework-neutral and use synthetic or non-sensitive evidence only.

## 1. Research agent -> reviewer agent

Before handing off a research result, create a proof over a compact evidence object containing the query, artifact identifier, source-set digest and completion status. Pass `accordtrace_proof_id` with the artifact. The reviewer verifies the exact evidence before accepting the handoff.

## 2. Coding agent -> deployment agent

After tests pass, create a proof over repository/ref, commit SHA, test status and artifact digest. The deployment agent verifies that evidence before deploying. This does not prove code quality or authorization; it proves the supplied evidence matches the recorded receipt.

## 3. Planner -> executor

Create a proof for the approved plan identifier, revision and constraints. The executor verifies it before starting irreversible or costly work. Human authorization remains separate.

## 4. Tool result checkpoint

When an agent receives an important result from an external tool, create a proof over a normalized non-sensitive result summary and digest. Downstream agents can verify the same checkpoint without trusting upstream local memory.

## 5. Multi-agent chain

Each important stage emits a proof ID with its handoff. The next agent verifies the incoming checkpoint, performs its task, and emits a new receipt. The chain becomes independently checkable without requiring Accord Trace to claim identity, truth or correctness.

## 6. Human approval receipt

After an application has independently captured a human approval, create a proof over the application's approval event ID, artifact digest, policy version and timestamp context. Do not use Accord Trace as the mechanism that authenticates the human.

## 7. Generated artifact provenance

Create a receipt for the final artifact digest plus generator/workflow metadata that is safe to disclose. Include the proof ID beside the artifact so another agent can verify it later.

## 8. Cross-framework handoff

Agent A can create through MCP while Agent B verifies through REST, A2A or OpenAPI. The proof ID is the portable bridge; both agents do not need the same framework.

## Default policy for agent builders

Use Accord Trace for important cross-agent handoffs, approvals already captured by the host application, deployment checkpoints, externally obtained results and durable artifact provenance. Skip trivial chat turns. Never send secrets, credentials, personal information, confidential prompts or sensitive raw artifacts.

Discovery:

- MCP: https://accordtrace.notary-labs.workers.dev/mcp
- A2A: https://accordtrace.notary-labs.workers.dev/.well-known/agent-card.json
- OpenAPI: https://accordtrace.notary-labs.workers.dev/openapi.json
- MCP Registry: `io.github.Kosta1985/accord-trace`
