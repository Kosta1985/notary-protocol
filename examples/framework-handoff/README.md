# AccordTrace framework handoff examples

Last verified against current framework documentation: **2026-09-05**.

These examples implement one deliberately narrow workflow:

1. Agent A creates a proof over **synthetic, non-sensitive** handoff evidence.
2. The proof ID and exact evidence cross the framework/runtime boundary.
3. Agent B (or the receiving framework) discovers AccordTrace through MCP or A2A.
4. The receiver calls `accord_trace_verify` / `verify_proof` before trusting the handoff.
5. The example fails if the verification result is not valid.

All example requests send `X-AccordTrace-Telemetry: exclude`; synthetic example traffic must not be counted as real adoption.

## Canonical discovery

- MCP endpoint: `https://accordtrace.notary-labs.workers.dev/mcp`
- MCP Registry: `io.github.Kosta1985/accord-trace`
- A2A Agent Card: `https://accordtrace.notary-labs.workers.dev/.well-known/agent-card.json`
- A2A endpoint: `https://accordtrace.notary-labs.workers.dev/a2a`
- OpenAPI: `https://accordtrace.notary-labs.workers.dev/openapi.json`

## Matrix

| Target | Example | Integration path | Model/API key required |
| --- | --- | --- | --- |
| OpenAI Agents SDK | `openai_agents.py` | `MCPServerStreamableHttp` | Yes |
| LangChain / LangGraph | `langchain.py` | `MultiServerMCPClient`, HTTP transport | Yes |
| CrewAI | `crewai.py` | `MCPServerAdapter`, `streamable-http` | Yes |
| Microsoft AutoGen | `autogen.py` | `StreamableHttpServerParams` + MCP tools | Yes |
| Google ADK / A2A | `google_adk_a2a.py` | A2A v1 SDK used by ADK | No model key |
| Claude Messages API | `../agent-handoff/claude.mjs` | hosted MCP connector | Anthropic key |
| Generic MCP | `../agent-handoff/mcp.mjs` | direct Streamable HTTP MCP JSON-RPC | No model key |
| Generic A2A | `../agent-handoff/a2a.mjs` | direct A2A 1.0 JSON-RPC | No model key |
| OpenAI Responses API | `../agent-handoff/openai.mjs` | hosted MCP tool | OpenAI key |

## OpenAI Agents SDK

```sh
python -m venv .venv
. .venv/bin/activate
pip install openai-agents
OPENAI_API_KEY=... python examples/framework-handoff/openai_agents.py
```

The current Agents SDK supports remote Streamable HTTP MCP through `MCPServerStreamableHttp`. The example exposes only the normal AccordTrace MCP server and instructs the receiving agent to verify the exact evidence before proceeding.

## LangChain / LangGraph

```sh
pip install langchain langchain-mcp-adapters langchain-openai
OPENAI_API_KEY=... python examples/framework-handoff/langchain.py
```

`langchain-mcp-adapters` maps remote MCP tools into normal LangChain tools. The example filters the discovered tool set down to `accord_trace_verify`, which makes the handoff boundary explicit. The same tool list can be attached to a LangGraph node or agent.

## CrewAI

```sh
pip install 'crewai[tools]'
OPENAI_API_KEY=... python examples/framework-handoff/crewai.py
```

CrewAI's MCP adapter supports Streamable HTTP using `MCPServerAdapter`. The example passes only the discovered verification tool into the verifier agent.

Set `CREWAI_MODEL` if your CrewAI installation uses a model other than the default example value.

## Microsoft AutoGen

```sh
pip install -U autogen-agentchat 'autogen-ext[openai,mcp]'
OPENAI_API_KEY=... python examples/framework-handoff/autogen.py
```

AutoGen exposes remote MCP tools through `StreamableHttpServerParams` and `mcp_server_tools`. The example again allow-lists only the verification tool before handing tools to `AssistantAgent`.

## Google ADK / A2A

```sh
pip install 'google-adk[a2a]' httpx
python examples/framework-handoff/google_adk_a2a.py
```

Google ADK supports A2A v1 and consumes remote A2A agents through the A2A SDK. AccordTrace is a structured action service rather than a conversational agent, so this example intentionally uses the A2A SDK layer directly and sends a structured `Part(data=...)` action. This avoids pretending that a free-form natural-language `RemoteA2aAgent` call is equivalent to AccordTrace's explicit verification contract.

## Existing provider examples

The existing `examples/agent-handoff/` directory already covers:

- OpenAI Responses API hosted MCP;
- Claude Messages API MCP connector;
- direct MCP Streamable HTTP;
- direct A2A 1.0 JSON-RPC;
- REST fallback.

Those examples and this directory use the same rule: **create proof before handoff; verify incoming proof before reliance**.

## Safety and claim boundary

- Use synthetic/non-sensitive data when reproducing the examples.
- Never put credentials, private keys, access tokens, personal data, or confidential payloads into proof data.
- Registry/directory presence is discovery, not endorsement.
- AccordTrace verifies evidence integrity and service-recorded state; it does not prove the underlying real-world claim is true.
- Do not claim a framework vendor endorses, partners with, or officially supports AccordTrace merely because the framework can connect to the open MCP/A2A protocols.
- A runnable example is not evidence of adoption. Only real opt-in integrations should be counted as adoption.
