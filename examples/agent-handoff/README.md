# Agent handoff examples

These examples create a production Accord Trace proof for an Agent A to Agent B handoff, then verify the same evidence through a specific production interface.

No example treats a positive verification as proof of truth, identity, authorization, legality, or commercial quality. A valid result means the submitted data matches the cryptographic evidence recorded by Accord Trace.

## Run

Node.js 20 or newer is required. No package installation is needed.

```bash
node examples/agent-handoff/rest.mjs
node examples/agent-handoff/mcp.mjs
node examples/agent-handoff/a2a.mjs

OPENAI_API_KEY=... node examples/agent-handoff/openai.mjs
ANTHROPIC_API_KEY=... node examples/agent-handoff/claude.mjs
```

Set `ACCORD_TRACE_URL` to exercise another compatible deployment. The OpenAI and Claude examples also accept `OPENAI_MODEL` and `ANTHROPIC_MODEL`.

## Interfaces

- REST creates a proof with `POST /api/v1/proofs` and verifies it with `POST /api/v1/verify`.
- MCP creates the proof through REST, then calls the production `accord_trace_verify` tool over Streamable HTTP.
- A2A creates the proof through REST, then sends a `SendMessage` JSON-RPC request with `A2A-Version: 1.0`.
- OpenAI gives the Responses API access only to `accord_trace_verify` on the production remote MCP server.
- Claude gives the Messages API MCP connector access only to `accord_trace_verify` using the current `mcp-client-2025-11-20` beta contract.

The placeholder artifact digest is intentionally public and non-sensitive. Replace it with the real artifact SHA-256 digest in an integration. Metadata is public and must never contain secrets.
