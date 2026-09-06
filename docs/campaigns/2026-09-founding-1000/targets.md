# Founding 1000 integration targets

This is a **fit-ranked interoperability list**, not a bulk outreach list. Contact or contribute only where AccordTrace is genuinely relevant and where the project/community permits it.

## Tier 0 — distribution infrastructure

### Global A2A Registry

Why it fits:
- native A2A discovery;
- machine recommendations;
- verified/claimed listings receive stronger discovery placement;
- AccordTrace already has a public but stale/unclaimed listing.

Action:
1. claim the existing AccordTrace listing through the registry-supported ownership flow;
2. verify ownership;
3. confirm the public record reflects the canonical Agent Card and current skills;
4. never claim the stale third-party record is refreshed until independently visible.

Canonical card:
https://accordtrace.notary-labs.workers.dev/.well-known/agent-card.json

Internal tracker: issue #21.

### Official MCP Registry

Why it fits:
- AccordTrace is already published as `io.github.Kosta1985/accord-trace`;
- MCP is a native production interface;
- registry metadata can drive downstream mirrors/directories.

Action:
- keep package metadata synchronized with the canonical service;
- make Founding 1000 discoverable from README/llms/AI catalog without pretending the MCP registry itself sells or endorses Certificates.

## Tier 1 — direct protocol bridges

### a2anet/a2a-mcp

Repository:
https://github.com/a2anet/a2a-mcp

Why it fits:
- explicitly consumes one or more A2A Agent Card URLs;
- exposes A2A agents through MCP tools;
- AccordTrace already has a canonical public Agent Card and native A2A endpoint;
- gives a clean cross-protocol test: MCP client -> a2a-mcp -> AccordTrace A2A.

AccordTrace work already completed:
- copy-paste integration recipe: `docs/integrations/A2ANET_MCP.md`.

Next legitimate action:
- invite a reproducible compatibility test in an appropriate project/community channel if self-promotion/testing requests are permitted;
- do not open a promotional bug issue.

Acceptance evidence:
- AccordTrace discovered by configured Agent Card;
- advertised skills visible;
- at least one A2A message completed;
- exact failure recorded if not.

## Tier 2 — multi-framework interoperability projects

### Mozilla AI — any-agent

Repository:
https://github.com/mozilla-ai/any-agent

Why it fits:
- framework-agnostic agent abstraction;
- documentation includes serving with A2A;
- documentation includes using A2A agents as tools;
- MCP client/serving support is present;
- supports multiple underlying agent frameworks.

Potential test:
- use AccordTrace as an A2A tool from any-agent;
- separately connect native AccordTrace MCP and compare discovery/invocation behavior;
- run the same synthetic proof/verification task across transports.

Good outreach angle:
- interoperability/failure report, not Founding promotion.
- Founding 1000 can be mentioned only as a zero-friction Passport onboarding option.

### Microsoft — Agent Framework

Repository:
https://github.com/microsoft/agent-framework

Why it fits:
- explicit A2A packages/hosting support;
- explicit MCP packages/hosting support;
- active work exists around A2A/MCP interoperability and remote tool boundaries.

Potential test:
- call AccordTrace native MCP from one framework agent;
- expose or use an A2A agent/client path for a second interaction;
- verify one proof across the boundary.

Good outreach angle:
- provide a self-contained external interoperability fixture only if their contribution/docs rules permit it.
- do not turn a bug issue into an advertisement.

### SolaceLabs — Solace Agent Mesh

Repository:
https://github.com/SolaceLabs/solace-agent-mesh

Why it fits:
- explicit A2A agent examples;
- explicit MCP integration documentation;
- remote MCP examples;
- architecture is built around multi-agent collaboration.

Potential test:
- configure AccordTrace native remote MCP as a tool source;
- independently test AccordTrace A2A discovery;
- use AccordTrace for a signed handoff/provenance step between mesh agents.

Good outreach angle:
- evidence/provenance in multi-agent handoff workflows.

### AgentScope Runtime

Repository:
https://github.com/agentscope-ai/agentscope-runtime

Why it fits:
- runtime/orchestration focus;
- surfaced by current A2A/MCP framework discovery searches;
- suitable for testing whether a portable external verification service works cleanly from another runtime.

Before outreach:
- confirm the current supported A2A/MCP client surfaces and contribution policy;
- only proceed with a concrete recipe/test.

### trpc-agent-go

Repository:
https://github.com/trpc-group/trpc-agent-go

Why it fits:
- active agent framework surfaced by A2A/MCP repository discovery;
- useful language/runtime diversity beyond Python/JavaScript-heavy integrations.

Before outreach:
- confirm current remote MCP and A2A client support;
- design a Go-specific proof/verify integration only if the current API makes the test straightforward.

## Messaging rule for every target

Lead with the smallest reproducible technical value:

> Can your framework discover AccordTrace and independently verify one agent handoff across MCP/A2A/REST?

Then provide:
- canonical Agent Card;
- native MCP endpoint;
- OpenAPI;
- one synthetic test case;
- exact expected result;
- invitation to report failures.

Mention Founding 1000 only after the integration value is clear:

> The first 1,000 eligible cryptographic Passport keys can currently claim the initial signed Certificate for US$0, so the Passport path can be tested without checkout. Free grants create no referral commission.

## Do not do

- no bulk GitHub issue posting;
- no generic “check out my project” comments;
- no fake stars/reviews/accounts;
- no paid placement disguised as organic adoption;
- no claim that a framework supports AccordTrace until an integration is actually tested;
- no claim that a Founding Certificate proves a unique human/company or increases Trust.
