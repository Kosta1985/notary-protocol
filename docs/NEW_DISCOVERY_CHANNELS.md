# New AccordTrace discovery channels

This file tracks additional distribution surfaces beyond the channels already documented in `REGISTRY_STATUS.md`.

## Outreach started — 29 Aug 2026

The following MCP discovery services were contacted with the canonical remote MCP endpoint and neutral product description:

- Smithery — requested remote MCP indexing/publication guidance.
- Glama — requested MCP directory indexing and current metadata requirements.
- MCP.so — requested directory inclusion and current self-service submission route.
- PulseMCP — requested discovery/indexing and current submission route.
- Cline MCP Marketplace — public submission opened: https://github.com/cline/mcp-marketplace/issues/2358
- LobeHub MCP Marketplace — public fallback submission opened: https://github.com/lobehub/lobehub/issues/18808

Canonical MCP endpoint:

`https://accordtrace.notary-labs.workers.dev/mcp`

Canonical source:

`https://github.com/Kosta1985/notary-protocol`

Neutral description used for outreach:

> AccordTrace provides portable, tamper-evident receipts for AI-agent actions and handoffs, independently verifiable over MCP, A2A, REST, and OpenAPI.

## Next discovery surfaces

Prioritize surfaces that are used by agents, agent builders, MCP clients, and framework maintainers rather than generic startup directories:

1. Complete Glama indexing/claim and quality evaluation. This is a prerequisite for the largest `awesome-mcp-servers` curated list.
2. After Glama has indexed the server, submit AccordTrace to `punkpeye/awesome-mcp-servers` under Security using its automated-agent PR fast-track (`🤖🤖🤖`).
3. Complete the LobeHub self-service CLI publication if its GitHub-linked browser authentication becomes available.
4. Framework-specific reproducible examples for OpenAI Agents SDK, LangGraph/LangChain, CrewAI, AutoGen, PydanticAI, and Cloudflare Agents SDK.
5. Security / AI-governance developer communities where the interoperability challenge can be reproduced rather than promoted as an unverified claim.

## Submission blockers / integrity notes

- Cline submission is open, but the Cline-specific README-only installation checkbox was deliberately left unchecked until that exact integration test is reproduced. Do not claim it prematurely.
- LobeHub now prefers its self-service CLI. The CLI requires a browser login and GitHub-link step, so the public issue is a fallback rather than a claim of marketplace acceptance.
- `awesome-mcp-servers` currently requires a Glama listing and Glama score badge. Do not open a knowingly failing PR before Glama indexing exists.

## Claim policy

Do not claim a listing until the external service confirms or publicly indexes AccordTrace. Do not fabricate users, reviews, endorsements, partnerships, usage counts, or agent integrations. Registry inclusion is a discovery signal only.
