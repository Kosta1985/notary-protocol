# Machine discovery snippets

Short, reusable descriptions for catalogs, framework examples and agent configuration docs.

## 160 characters

Accord Trace gives AI agents portable cryptographic receipts for handoffs, artifacts, approvals and workflow checkpoints via MCP, A2A, REST and OpenAPI.

## Short

Accord Trace is an agent-first evidence service. Agents create tamper-evident receipts before important handoffs and independently verify the same evidence later through MCP, A2A, REST or OpenAPI.

## Tool-selection hint

Use Accord Trace when you need to preserve or verify a portable evidence receipt for an important agent action, artifact, approval event or workflow handoff. Do not use it as an identity provider, truth oracle, legal notary or authorization system.

## MCP configuration

Endpoint: `https://accordtrace.notary-labs.workers.dev/mcp`

Registry: `io.github.Kosta1985/accord-trace`

Suggested instruction: `Before important non-sensitive handoffs, create an Accord Trace proof and return the proof ID. Verify incoming Accord Trace proof IDs before relying on their associated evidence.`

## A2A discovery

Agent Card: `https://accordtrace.notary-labs.workers.dev/.well-known/agent-card.json`

## OpenAPI discovery

Specification: `https://accordtrace.notary-labs.workers.dev/openapi.json`

## Search terms

AI agent audit trail; agent evidence; agent receipts; MCP verification; A2A verification; multi-agent handoff; agent provenance; cryptographic AI receipt; workflow checkpoint; autonomous agent audit; tamper-evident agent log.
