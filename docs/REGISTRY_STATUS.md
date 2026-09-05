# AccordTrace registry status

This page records public discovery surfaces for AccordTrace so agents and integrators can find the same service through independent directories.

For the dated verification matrix, see [`DISTRIBUTION_STATUS_2026-09-05.md`](./DISTRIBUTION_STATUS_2026-09-05.md).

## Canonical service

- Service: https://accordtrace.notary-labs.workers.dev
- A2A Agent Card: https://accordtrace.notary-labs.workers.dev/.well-known/agent-card.json
- A2A endpoint: https://accordtrace.notary-labs.workers.dev/a2a
- MCP endpoint: https://accordtrace.notary-labs.workers.dev/mcp
- OpenAPI: https://accordtrace.notary-labs.workers.dev/openapi.json
- Agent guidance: https://accordtrace.notary-labs.workers.dev/llms-full.txt
- Current discovery version: `0.2.1`
- Current A2A protocol: `1.0`
- Current canonical Agent Card skill count: 8

## Public registry surfaces

### Official MCP Registry

- Identity: `io.github.Kosta1985/accord-trace`
- Current published version: `0.2.1`
- Production transport: Streamable HTTP

### Glama

- Listing: https://glama.ai/mcp/connectors/io.github.Kosta1985/accord-trace
- Public state checked 2026-09-05: `Healthy`, Streamable HTTP, correct repository.
- Glama's public tool snapshot still shows the original four proof tools, so treat its tool-count view as partially stale until it refreshes from the current registry/runtime.

### Global A2A Registry

- Identity: `dev.workers.accord_trace`
- Listing: https://www.a2a-registry.org/agent/dev.workers.accord_trace
- Public state checked 2026-09-05: listing exists and points to the canonical Agent Card/A2A 1.0 interface.
- The directory's cached card metadata still reports an older version/four-skill snapshot. The canonical Agent Card is newer and authoritative.
- The listing is currently shown as unclaimed. Registry claim status is an ownership-management feature, not a protocol-validity or Trust signal.

### Agenstry

- Listing: https://agenstry.com/providers/Accord%20Trace
- The public provider page currently reports AccordTrace alive with 100% uptime but still displays the older four-skill / 80% / `Live JSON-RPC 0` presentation.
- Current production supports both `SendMessage` and `message/send`, A2A 1.0, and eight canonical skills; successful post-deploy Agenstry validator workflows verify that current runtime.
- Track public index convergence in issue #14 rather than regressing production to match the stale cache.

### Independent mirrors

Ahel's public integration and MCP catalogs currently include `accord-trace` from `Kosta1985/notary-protocol` and mark it as serving. Treat this as independent discovery only, not an endorsement or partnership.

## Pending marketplace requests

- Cline MCP Marketplace: https://github.com/cline/mcp-marketplace/issues/2358 — open submission; not yet a confirmed marketplace listing.
- LobeHub MCP Marketplace: https://github.com/lobehub/lobehub/issues/18808 — open fallback request; not yet a confirmed marketplace listing.

## Integrity and claim boundaries

Registry inclusion is a discovery signal, not an endorsement, identity proof, legal approval, partnership, or quality guarantee. AccordTrace records and verifies cryptographic evidence integrity and service-recorded time; it does not establish the truth of the underlying real-world claim.

Third-party directories may cache older versions of the Agent Card or MCP tool list. The canonical service endpoints above are authoritative for the current public interface.

## Verification work

- Public interoperability board: https://github.com/Kosta1985/notary-protocol/issues/17
- Discovery quality tracking: https://github.com/Kosta1985/notary-protocol/issues/14
- Distribution tracking: https://github.com/Kosta1985/notary-protocol/issues/21
- Reproducible evaluation: ./AGENT_EVAL.md
- Connect an agent: ./CONNECT_YOUR_AGENT.md
