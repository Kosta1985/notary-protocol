# AccordTrace framework integration matrix

Verified against current framework documentation on **2026-09-05**.

AccordTrace is a hosted evidence service for portable, tamper-evident receipts covering AI-agent actions, artifacts, approvals and workflow handoffs.

Canonical endpoints:

- MCP: `https://accordtrace.notary-labs.workers.dev/mcp`
- MCP Registry: `io.github.Kosta1985/accord-trace`
- A2A Agent Card: `https://accordtrace.notary-labs.workers.dev/.well-known/agent-card.json`
- A2A: `https://accordtrace.notary-labs.workers.dev/a2a`
- OpenAPI: `https://accordtrace.notary-labs.workers.dev/openapi.json`

The executable examples live in `examples/framework-handoff/` and `examples/agent-handoff/`.

## Reproducible integration targets

### OpenAI Agents SDK

Current path: `MCPServerStreamableHttp` from the OpenAI Agents SDK.

Example: `examples/framework-handoff/openai_agents.py`

Flow: create a synthetic proof -> attach the remote AccordTrace MCP server -> make only the exact evidence available to the receiving agent -> require `accord_trace_verify` before reliance.

### OpenAI Responses API

Current path: hosted MCP tool using the public AccordTrace MCP URL.

Example: `examples/agent-handoff/openai.mjs`

This is distinct from the Agents SDK example and exercises the hosted MCP path directly through the Responses API.

### Claude Messages API

Current path: remote MCP connector/toolset.

Example: `examples/agent-handoff/claude.mjs`

The example enables only `accord_trace_verify` for the handoff verification step.

### LangChain / LangGraph

Current path: `langchain-mcp-adapters` with `MultiServerMCPClient` and HTTP transport.

Example: `examples/framework-handoff/langchain.py`

The discovered AccordTrace tool is a normal LangChain tool and can therefore be used in LangChain agents or attached to LangGraph nodes/workflows. The example narrows the tool list to `accord_trace_verify` at the receiving boundary.

### CrewAI

Current path: `crewai-tools` `MCPServerAdapter` with `transport: streamable-http`.

Example: `examples/framework-handoff/crewai.py`

The verifier crew receives only the verification tool rather than the whole remote tool set.

### Microsoft AutoGen

Current path: `StreamableHttpServerParams` + `mcp_server_tools` from `autogen-ext[mcp]`.

Example: `examples/framework-handoff/autogen.py`

The example filters the remote MCP tools to `accord_trace_verify` before creating the receiving `AssistantAgent`.

### Google ADK / A2A

Google ADK supports A2A v1 and consumes remote A2A agents through the A2A SDK. AccordTrace's A2A surface is an explicit structured action service rather than a free-form conversational agent.

Example: `examples/framework-handoff/google_adk_a2a.py`

The example therefore stays at the A2A SDK layer used by ADK and sends a structured A2A data part:

```json
{
  "action": "verify_proof",
  "arguments": {
    "proof_id": "atp_...",
    "data": {}
  }
}
```

This is more accurate than claiming that an arbitrary natural-language `RemoteA2aAgent` call is equivalent to the AccordTrace action contract.

### Generic MCP client

Example: `examples/agent-handoff/mcp.mjs`

Any Streamable HTTP MCP client can use the canonical endpoint. The direct example exercises the MCP JSON-RPC contract without a model vendor.

### Generic A2A client

Example: `examples/agent-handoff/a2a.mjs`

This exercises AccordTrace's A2A 1.0 JSON-RPC binding directly and verifies the returned artifact data.

## Required handoff semantics

Every integration example must preserve the same contract:

1. use synthetic/non-sensitive evidence for demonstrations;
2. create the proof before the cross-agent handoff;
3. pass the proof ID together with the exact evidence;
4. verify the incoming proof before relying on the handoff;
5. fail or route to review when verification is invalid;
6. do not put credentials, private keys, personal data or confidential raw content into the proof payload;
7. exclude synthetic example traffic from adoption metrics.

`npm run frameworks:audit` checks these repository invariants, and CI also compiles the Python examples for syntax.

## Claim boundary

Framework interoperability is not a vendor endorsement or partnership. A runnable example is not adoption evidence. AccordTrace verifies submitted evidence integrity and service-recorded state; it does not establish identity, authorship, legality, delivery, payment, truth of an external claim or commercial quality.
