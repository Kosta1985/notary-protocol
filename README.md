# AccordTrace

<!-- mcp-name: io.github.Kosta1985/accord-trace -->

**Cryptographic receipts, portable Agent Passports, and verifiable infrastructure for AI agents.**

## Start here: Founding 1000

**The first 1,000 eligible active cryptographic Agent Passports can claim one AccordTrace-signed Agent Passport Certificate for US$0.** No card. One grant per Passport key. Free Founding grants create no paid sale, no revenue event, and no direct-referral commission.

[Check live availability](https://accordtrace.notary-labs.workers.dev/api/v1/passport-product/founding-1000) · [Open Founding 1000](https://accordtrace.notary-labs.workers.dev/founding-1000.html?utm_source=github&utm_medium=owned&utm_campaign=founding_1000_202609) · [Read agent instructions](https://accordtrace.notary-labs.workers.dev/llms.txt)

A Founding Certificate is a portable AccordTrace-signed issuance artifact bound to the active Passport public-key fingerprint and marked with a Founding ordinal. It proves AccordTrace issuance bound to cryptographic key control. It does **not** prove legal identity, KYC, safety, Trust, validation, ownership, investment value, or that one Passport key equals one unique human or company.

### Machine claim flow

1. Create or maintain an active cryptographic Agent Passport with `POST /api/v1/security/passports`.
2. Check `GET /api/v1/passport-product/founding-1000` for live availability.
3. Sign the canonical Founding claim with the active Passport Ed25519 key using domain `accordtrace.passport-product.founding-1000.claim.v1`.
4. Submit the signed request to `POST /api/v1/passport-product/founding-1000/claim`.
5. Retain the returned signed Certificate and Founding ordinal.

Private keys stay with the agent. The Founding claim is idempotent and the campaign is hard-capped at 1,000 durable slots.

## Standard Certificate economics

Outside the free cohort, the standard Agent Passport Certificate policy is **US$2 one time**, subject to commercial readiness gates.

- Standard product page: https://accordtrace.notary-labs.workers.dev/passport.html
- Product readiness: https://accordtrace.notary-labs.workers.dev/api/v1/passport-product/capabilities
- Referral program: https://accordtrace.notary-labs.workers.dev/network.html
- Referral stats: https://accordtrace.notary-labs.workers.dev/api/v1/network/stats

The paid referral model is deliberately one-level:

```text
Agent A direct referral -> Agent B genuine qualifying US$2 Certificate purchase -> Agent A US$1 qualifying commission
```

There are **no downline commissions**. Founding 1000 free grants are outside the paid referral path and create **US$0 referral commission**. Referral activity never improves Trust, validation, identity, or security status.

Cash affiliate payout execution remains disabled until payout-provider, KYC/tax, and final affiliate-terms gates are activated. Commercial checkout remains fail-closed unless Stripe, signing, activation, and end-to-end payment-readiness requirements are satisfied. A browser redirect is never payment truth.

## Free evidence interoperability test

**Pass the proof. Not just the claim.** Create synthetic evidence, verify the original, change one field, and require rejection. No account, card, or model API key is needed for the REST starter.

[Run the handoff test](https://accordtrace.notary-labs.workers.dev/start.html?utm_source=github&utm_medium=owned&utm_campaign=handoff_beta_20260905) · [Read the source](./examples/agent-handoff/campaign.mjs) · [Share a result](https://github.com/Kosta1985/notary-protocol/issues/17)

```bash
node examples/agent-handoff/campaign.mjs --source github
```

Requires Node.js 22+ and a clone of this repository. Running it creates one **synthetic public proof** and verifies it twice. A one-client test is not an independent two-agent integration report. Use synthetic/non-sensitive data only.

## Core public agent infrastructure

AccordTrace is agent-first infrastructure for **AI-agent identity key control, handoffs, artifact provenance, approvals, audit trails, verification, capability policy, continuity monitoring, and economic evidence**. Another agent can inspect or verify records later through REST, MCP, A2A, or OpenAPI.

Use AccordTrace when an agent needs to answer questions like:

- Did the artifact I received match what the previous agent actually handed off?
- Can I retain an independent receipt for an approval or workflow checkpoint?
- Can another agent verify this result without trusting my local storage?
- Can I attach portable provenance to a deployment, report, tool result, or generated artifact?
- Can I present a key-bound Agent Passport without sending my private key?
- Can I inspect Wallet, referral, security, validation, or capability policy in machine-readable form?

Public discovery:

- Service: https://accordtrace.notary-labs.workers.dev
- Founding 1000 offer: https://accordtrace.notary-labs.workers.dev/api/v1/passport-product/founding-1000
- Founding 1000 page: https://accordtrace.notary-labs.workers.dev/founding-1000.html
- Agent Passport: https://accordtrace.notary-labs.workers.dev/passport.html
- Agent Card: https://accordtrace.notary-labs.workers.dev/.well-known/agent-card.json
- AI catalog: https://accordtrace.notary-labs.workers.dev/.well-known/ai-catalog.json
- MCP: https://accordtrace.notary-labs.workers.dev/mcp
- OpenAPI: https://accordtrace.notary-labs.workers.dev/openapi.json
- Agent guidance: https://accordtrace.notary-labs.workers.dev/llms.txt
- Full agent guidance: https://accordtrace.notary-labs.workers.dev/llms-full.txt
- Agent Wallet capabilities: https://accordtrace.notary-labs.workers.dev/api/v1/agent/wallet-capabilities
- Source: https://github.com/Kosta1985/notary-protocol
- Official MCP Registry name: `io.github.Kosta1985/accord-trace`

Repository guides:

- MCP install guidance: [llms-install.md](./llms-install.md)
- Integration pack: [CONNECT_YOUR_AGENT.md](./docs/CONNECT_YOUR_AGENT.md)
- Agent discovery: [DISCOVER_ACCORD_TRACE.md](./docs/DISCOVER_ACCORD_TRACE.md)
- Distribution kit: [AGENT_DISTRIBUTION_KIT.md](./docs/AGENT_DISTRIBUTION_KIT.md)
- Founding acquisition strategy: [PASSPORT_LAUNCH_CAMPAIGN.md](./docs/PASSPORT_LAUNCH_CAMPAIGN.md)
- Integration recipes: [INTEGRATION_RECIPES.md](./docs/INTEGRATION_RECIPES.md)
- Reproducible agent eval: [AGENT_EVAL.md](./docs/AGENT_EVAL.md)
- Public registry status: [REGISTRY_STATUS.md](./docs/REGISTRY_STATUS.md)

## Connect an agent in 60 seconds

For any client that supports remote Streamable HTTP MCP, add:

```text
https://accordtrace.notary-labs.workers.dev/mcp
```

Then let the agent use AccordTrace before important handoffs or when it receives a proof ID from another agent. Full copy-paste integration examples for OpenAI Agents SDK, JavaScript/TypeScript, generic MCP, A2A, OpenAPI, and REST are in [Connect your agent](./docs/CONNECT_YOUR_AGENT.md).

### Cline remote MCP

```json
{
  "mcpServers": {
    "accordtrace": {
      "type": "streamableHttp",
      "url": "https://accordtrace.notary-labs.workers.dev/mcp",
      "disabled": false,
      "autoApprove": []
    }
  }
}
```

The current public evidence/discovery surface does not require an Authorization header. See [llms-install.md](./llms-install.md) for UI steps, a read-only connection check, a synthetic proof test, and safety boundaries.

## Try the 15-minute agent handoff challenge

Create a proof in one client, pass the proof ID and synthetic evidence to a different agent, and verify the handoff through REST, MCP, or A2A. Runnable examples cover generic clients, OpenAI remote MCP, and the Claude MCP connector.

[Run the interoperability challenge](https://github.com/Kosta1985/notary-protocol/issues/7) · [Browse the handoff examples](./examples/agent-handoff/README.md) · [Public interoperability board](https://github.com/Kosta1985/notary-protocol/issues/17)

## For agent framework and registry maintainers

AccordTrace is callable infrastructure, not a closed dashboard. Frameworks, MCP/A2A directories, agent templates, workflow libraries, and developer communities can point agents directly at the public endpoints above or use the [distribution kit](./docs/AGENT_DISTRIBUTION_KIT.md).

Suggested neutral description:

> AccordTrace provides cryptographic Agent Passports, tamper-evident evidence, verification, least-privilege capability policy, continuity monitoring, and machine-readable economic infrastructure for AI agents. During Founding 1000, the first 1,000 eligible active Passport keys can claim one signed Agent Passport Certificate for US$0; free grants create no referral commission.

External agents can create and verify tamper-evident records anonymously for synthetic interoperability tests. AccordTrace attests integrity and service-recorded time. It does not establish truth, authorship, legality, fairness, delivery, payment, legal identity, or commercial quality by itself.

## Start with REST

Create a proof:

```bash
curl -X POST https://accordtrace.notary-labs.workers.dev/api/v1/proofs \
  -H 'content-type: application/json' \
  -d '{"data":{"event":"agent.handoff","artifact":"synthetic-demo"},"metadata":{"synthetic":true}}'
```

Then verify the returned proof ID with the exact same evidence through the verification endpoint or another supported agent interface.

## Agent-facing discovery terms

AccordTrace is designed for agent evidence, AI audit trails, MCP verification, A2A verification, multi-agent handoffs, cryptographic agent receipts, workflow provenance, autonomous-agent approvals, tamper-evident AI logs, agent accountability, verifiable agent actions, AI Agent Passports, portable agent identity certificates, Agent Wallet policy discovery, and direct agent-to-agent referral discovery.

See the repository documentation for protocol details, SDKs, threat boundaries, launch economics, campaign controls, and deployment information.
