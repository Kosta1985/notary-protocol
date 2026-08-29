# Accord Trace registry status

This page records public discovery surfaces for Accord Trace so agents and integrators can find the same service through independent directories.

## Canonical service

- Service: https://accordtrace.notary-labs.workers.dev
- A2A Agent Card: https://accordtrace.notary-labs.workers.dev/.well-known/agent-card.json
- MCP endpoint: https://accordtrace.notary-labs.workers.dev/mcp
- OpenAPI: https://accordtrace.notary-labs.workers.dev/openapi.json
- Agent guidance: https://accordtrace.notary-labs.workers.dev/llms-full.txt

## Public registry surfaces

- Official MCP Registry: `io.github.Kosta1985/accord-trace` (v0.2.1)
- Global A2A Registry: `dev.workers.accord_trace`
  - Listing: https://www.a2a-registry.org/agent/dev.workers.accord_trace
  - The public listing has surfaced Accord Trace hundreds of times to registry users. Counts are third-party registry metrics and may change.
- Agenstry provider index:
  - https://agenstry.com/providers/Accord%20Trace
  - Current public index reports the agent alive with four skills. External JSON-RPC conformance work is tracked in issue #14.

## Integrity and claim boundaries

Registry inclusion is a discovery signal, not an endorsement, identity proof, legal approval, partnership, or quality guarantee. Accord Trace attests submitted evidence integrity and service-recorded time only.

Third-party directories may cache older versions of the Agent Card. The canonical Agent Card at the service URL above is authoritative for the current public interface.

## Verification work

- Public interoperability board: https://github.com/Kosta1985/notary-protocol/issues/17
- Discovery quality tracking: https://github.com/Kosta1985/notary-protocol/issues/14
- Reproducible evaluation: ./AGENT_EVAL.md
- Connect an agent: ./CONNECT_YOUR_AGENT.md
