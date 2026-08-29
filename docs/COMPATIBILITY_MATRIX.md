# AccordTrace compatibility matrix

This matrix tracks supported protocol surfaces and integration status without overstating third-party validation. A row is only marked independently verified when a reproducible external test or accepted integration exists.

## Protocol surfaces

| Surface | Public endpoint | Project status | Independent verification |
|---|---|---|---|
| REST | `https://accordtrace.notary-labs.workers.dev/api/v1/proofs` | Supported | Pending external reproduction |
| MCP (remote Streamable HTTP) | `https://accordtrace.notary-labs.workers.dev/mcp` | Supported | Pending external reproduction |
| A2A | `https://accordtrace.notary-labs.workers.dev/.well-known/agent-card.json` | Supported | Pending external reproduction |
| OpenAPI | `https://accordtrace.notary-labs.workers.dev/openapi.json` | Supported | Pending external reproduction |
| Agent-readable guidance | `https://accordtrace.notary-labs.workers.dev/llms-full.txt` | Supported | Discovery aid, not a protocol conformance claim |

## Framework and client targets

| Ecosystem | Integration material | Validation status |
|---|---|---|
| OpenAI Agents / remote MCP clients | `docs/CONNECT_YOUR_AGENT.md` | Project-authored example; external validation pending |
| PydanticAI | `docs/FRAMEWORK_PROMO_INTEGRATIONS.md` | Project-authored example; external validation pending |
| Microsoft Agent Framework / AutoGen ecosystem | `docs/FRAMEWORK_PROMO_INTEGRATIONS.md` | Project-authored workflow; external validation pending |
| Generic MCP clients | `docs/CONNECT_YOUR_AGENT.md` | Endpoint available; client-by-client reproduction pending |
| A2A-compatible agents | Agent Card + `docs/AGENT_EVAL.md` | Endpoint available; independent reproduction pending |
| REST/OpenAPI agents | OpenAPI document + integration recipes | Endpoint available; independent reproduction pending |

## What counts as verified

A compatibility claim becomes **independently verified** only when at least one of the following is public and reproducible:

1. a third-party maintainer confirms the integration;
2. an accepted example/PR exists in an external framework repository;
3. an independent agent developer publishes a reproducible create → handoff → verify test;
4. a directory or registry performs a live protocol check and exposes the result;
5. a conformance test is executed by infrastructure outside the AccordTrace project.

## Reproduction target

The canonical interoperability test is intentionally simple:

1. Agent A creates a receipt for synthetic evidence.
2. Agent A passes the proof ID and exact evidence to Agent B.
3. Agent B verifies the receipt using a different client or protocol surface.
4. The verifier checks that the evidence digest and service attestation match.

Success and failure reports are both valuable. Concrete incompatibilities should include the client/framework version, transport used, request/response shape and whether the failure occurred during discovery, tool invocation, receipt retrieval or verification.

## Claim policy

Directory inclusion, search impressions, suggestions and crawler traffic are discovery signals only. They are not counted as users, integrations, independent validation or endorsements.
