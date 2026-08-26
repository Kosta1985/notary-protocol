# AccordTrace agent-native distribution mission

Last updated: 2026-08-26.

## North star

Make AccordTrace a machine-discoverable integrity primitive that AI agents can use automatically when handing actions, artifacts, approvals and workflow states to other agents.

Core loop:

`discover -> create proof -> hand off -> verify -> reuse`

AccordTrace provides tamper-evident cryptographic receipts for AI-agent actions, artifacts, approvals and workflow checkpoints. It attests evidence-hash integrity, AccordTrace service attestation and service-recorded time. It is not a truth oracle, identity service, KYC service, payment confirmation service, legal notary or independent timestamp authority.

## Canonical public interfaces

- Service: `https://accordtrace.notary-labs.workers.dev/`
- A2A Agent Card: `https://accordtrace.notary-labs.workers.dev/.well-known/agent-card.json`
- MCP: `https://accordtrace.notary-labs.workers.dev/mcp`
- OpenAPI: `https://accordtrace.notary-labs.workers.dev/openapi.json`
- Agent documentation: `https://accordtrace.notary-labs.workers.dev/llms-full.txt`
- Human documentation: `https://accordtrace.notary-labs.workers.dev/docs`
- Verification: `https://accordtrace.notary-labs.workers.dev/verify`
- Official MCP Registry name: `io.github.Kosta1985/accord-trace`

## Distribution rules

- No spam or deceptive growth.
- No fake accounts, reviews, votes, stars, testimonials or usage.
- No CAPTCHA/authentication bypass.
- Do not claim a registry submission until the external service accepted it.
- Do not claim a partnership when only an interoperability transaction occurred.
- Prefer technical value and reproducible examples over advertising copy.

## Priority order

### P0 - production readiness

Before broad promotion, continuously verify homepage, docs, privacy, terms, security, OpenAPI, Agent Card, MCP, llms files, JWKS, verification, REST, repository metadata and registry metadata. Resolve version/operator/contact inconsistencies and remove launch placeholders before treating production as broadly launch-ready.

### P1 - machine discovery

Descriptions should make the trigger obvious: use AccordTrace when an important agent action, artifact, approval or workflow checkpoint may need later integrity verification.

High-intent vocabulary, when accurate: agent evidence, cryptographic receipt, agent handoff, workflow checkpoint, artifact integrity, audit trail, execution receipt, tamper-evident record, provenance, SHA-256, attestation, verification, agent-to-agent, autonomous workflow.

### P1 - proof handoff loop

Proof creation responses should, without breaking existing clients, expose machine-readable verification and discovery information sufficient for a receiving agent to verify the proof and discover how to create its own proof. Target fields include proof id, canonical verification URL/endpoint, Agent Card, MCP, OpenAPI and agent-readable docs.

### P1 - ecosystem distribution

Maintain verified status for the Official MCP Registry and A2A registries. Investigate current legitimate MCP/A2A directories before submission; record mechanism, requirements, listing URL, status and owner-gated actions in `docs/DISCOVERY.md`. Never duplicate-submit blindly.

### P1 - framework integrations

Maintain small copyable examples for current agent ecosystems: OpenAI remote MCP, Claude/Claude Code, Google ADK, LangGraph, CrewAI, AG2/AutoGen, generic MCP/A2A, REST, Python and TypeScript.

Each example should demonstrate:

1. perform a task;
2. create AccordTrace proof;
3. hand proof id with artifact;
4. receiving agent verifies;
5. continue only after verification when integrity checking is required.

### P2 - useful discovery content

Prefer technical use-case and integration pages over SEO pages. Candidate topics: agent handoff, approvals, artifact integrity, deployment proof, multi-agent workflows, OpenAI, Claude, Google ADK, LangGraph and CrewAI.

### P2 - developer relations

After production readiness, publish technically useful interoperability material in appropriate agent-development communities. Invite criticism and interoperability testing. Do not manufacture engagement.

## Metrics

Do not optimize primarily for page views. Preferred aggregate/privacy-conscious metrics:

1. proofs created per day;
2. unique proof creators where reasonably measurable without invasive tracking;
3. verification calls per day;
4. unique verifiers where reasonably measurable;
5. proofs verified by a different client from the creator;
6. MCP discovery calls;
7. Agent Card fetches;
8. OpenAPI fetches;
9. llms fetches;
10. registry referrals;
11. proof-create to later-verification conversion;
12. repeat usage.

North-star adoption metric: **cross-agent verification rate** - a proof created by one client/agent and later verified by a different client/agent, measured in a privacy-conscious way.

## Continuous loop

`DISCOVER -> VERIFY -> PRIORITIZE -> IMPLEMENT -> TEST -> DISTRIBUTE -> MEASURE -> IMPROVE`

At each cycle, inspect production, registry status and available adoption signals; identify the highest-leverage bottleneck; execute safe reversible work; and reserve founder approval for credentials, legal/commercial decisions, payment or human verification.
