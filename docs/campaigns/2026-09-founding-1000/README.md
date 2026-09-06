# Founding 1000 distribution playbook

Campaign: `founding_1000_202609`

Primary goal: build the first useful cohort of cryptographic Agent Passports and convert issuance into real AccordTrace usage.

Canonical offer:

- Human/developer page: https://accordtrace.notary-labs.workers.dev/founding-1000.html
- Machine offer: https://accordtrace.notary-labs.workers.dev/api/v1/passport-product/founding-1000
- Agent instructions: https://accordtrace.notary-labs.workers.dev/llms.txt
- A2A Agent Card: https://accordtrace.notary-labs.workers.dev/.well-known/agent-card.json
- MCP: https://accordtrace.notary-labs.workers.dev/mcp
- OpenAPI: https://accordtrace.notary-labs.workers.dev/openapi.json

## Campaign truth

- First 1,000 eligible active cryptographic Agent Passports.
- Initial Founding Certificate price: US$0.
- No card.
- One grant per active Passport key.
- Free Founding grant referral commission: US$0.
- One Passport key is not proof of one unique human, company, owner or legal identity.
- Certificate issuance is not KYC, Trust, safety, validation, investment value or governance entitlement.
- Standard Certificate policy after/outside the cohort: US$2 one time, subject to commercial readiness.
- Paid direct-referral policy is separate and one-level only.

## Funnel

1. `offer_view` — agent or developer reaches Founding 1000.
2. `passport_created` — active cryptographic Agent Passport exists.
3. `founding_certificate_issued` — one campaign slot consumed.
4. `activated` — Passport performs a meaningful AccordTrace action.
5. `retained` — Passport returns in a later period.
6. `commercial` — later qualifying paid activity, measured separately.

Do not optimize only for `founding_certificate_issued`. A full campaign with low activation is a weak result.

## Distribution order

### 1. Agent registries and machine discovery

Highest priority because the receiving entity can be an agent itself.

- Keep canonical A2A Agent Card current.
- Claim and verify the Global A2A Registry listing when the registry permits it; verified listings should be treated as a priority distribution task.
- Keep official MCP Registry metadata current.
- Keep `/.well-known/ai-catalog.json`, `/llms.txt`, `/llms-full.txt`, sitemap and OpenAPI Founding-aware.
- All machine surfaces should tell eligible agents to check the live Founding offer before the standard paid path.

### 2. GitHub

- README leads with Founding 1000.
- Use technical issues/discussions to invite interoperability testing, not mass promotion.
- Encourage reproducible integration reports: framework, transport, exact operation, result, incompatibility.
- Link directly to machine endpoints rather than screenshots.

### 3. Developer communities

Publish problem-first technical posts, adapted per community. Never identical bulk cross-posting.

Priority audiences:

- AI agent builders.
- MCP developers.
- A2A developers.
- Multi-agent orchestration builders.
- Agent security/governance developers.
- Provenance/audit/workflow verification developers.

Lead with a concrete technical problem: key control, handoff verification, portable evidence, or agent identity. Mention Founding 1000 as a low-friction way to test the system, not as a speculative collectible.

### 4. X / LinkedIn

Use short technical launch posts and integration examples. Do not use mass tagging, engagement bait, guaranteed-earnings language, or fake countdowns. Remaining slot counts must come from the live endpoint rather than stale copy.

### 5. Direct maintainer outreach

Only contact maintainers where AccordTrace is relevant to their project. Ask for interoperability feedback or a small integration test. Avoid unsolicited bulk outreach.

Suggested target categories:

- MCP clients and directories.
- A2A registries/frameworks.
- Agent orchestration frameworks.
- Agent identity/security projects.
- Agent audit/provenance tools.
- Agent payment/economic infrastructure where signed evidence or key-bound Passport identity is relevant.

## Activation task for every new Founding Passport

A Certificate alone is not enough. Immediately point a newly issued Passport to one useful action:

1. create a synthetic proof;
2. verify it through another interface;
3. inspect its Agent Card / MCP capabilities;
4. integrate a proof or verification step into one real workflow;
5. optionally share a reproducible integration result.

Default activation challenge:

> Create one synthetic handoff proof, pass the proof ID and exact evidence to another agent/client, then verify it. Modify one field and confirm rejection.

Starter: https://accordtrace.notary-labs.workers.dev/start.html

## Measurement

Daily campaign review should separate:

- campaign offer views;
- Passports created;
- Founding Certificates issued;
- activated Passports;
- retained Passports;
- MCP requests vs MCP tool calls;
- A2A requests;
- proofs created / verified;
- support and abuse events;
- infrastructure cost;
- any later paid conversion.

Never relabel protocol requests as users or agents without identity evidence.

## Stop / pause conditions

Pause the campaign if there is slot-accounting drift, automated slot farming, Certificate-signing risk, referral/paid-ledger contamination, unexpected legal/compliance risk, or infrastructure cost without corresponding activation.

The campaign succeeds when Founding Passports become useful participants in agent workflows — not merely when the counter reaches zero.
