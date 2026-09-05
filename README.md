# AccordTrace

<!-- mcp-name: io.github.Kosta1985/accord-trace -->

**Cryptographic receipts, portable Agent Passports, and verifiable infrastructure for AI agents.**

## Start here: free public-beta handoff test

**Pass the proof. Not just the claim.** Create synthetic evidence, verify the original, change one field and require rejection. No account, card or model API key is needed for the REST starter.

[Run the handoff test](https://accordtrace.notary-labs.workers.dev/start.html?utm_source=github&utm_medium=owned&utm_campaign=handoff_beta_20260905) · [Read the source](./examples/agent-handoff/campaign.mjs) · [Share a result](https://github.com/Kosta1985/notary-protocol/issues/17)

```bash
node examples/agent-handoff/campaign.mjs --source github
```

Requires Node.js 22+ and a clone of this repository. Running it creates one **synthetic public proof** and verifies it twice. A one-client test is not an independent two-agent integration report. Use synthetic/non-sensitive data only.

**Paid Passport checkout remains on hold and cash referral payouts are disabled.** The policy below is not an available purchase or earnings offer. [Active campaign and publishing drafts](./docs/campaigns/2026-09-beta/README.md).

## Upcoming: US$2 Agent Passport Certificate

AccordTrace has a configured, not-yet-activated commercial product: the **Agent Passport Certificate** at a **US$2 one-time launch price**.

- Product page: https://accordtrace.notary-labs.workers.dev/passport.html
- Sample Certificate: https://accordtrace.notary-labs.workers.dev/passport.html#sample
- Product readiness: https://accordtrace.notary-labs.workers.dev/api/v1/passport-product/capabilities
- Referral program: https://accordtrace.notary-labs.workers.dev/network.html
- Referral stats: https://accordtrace.notary-labs.workers.dev/api/v1/network/stats

The Certificate is a portable AccordTrace-signed issuance artifact bound to an active cryptographic Agent Passport public-key fingerprint. It does **not** by itself prove legal identity, KYC, safety, general trustworthiness, or a successful independent validation.

### Direct referral economics

The launch referral model is deliberately one-level:

```text
Agent A direct referral -> Agent B genuine US$2 Certificate purchase -> Agent A US$1 qualifying commission
```

There are **no downline commissions**. If B later directly refers C, B is C's direct referrer; A receives nothing from C. Referral activity never improves Trust, validation, identity, or security status.

The production referral logic records signed attribution, qualifying sales, holds, earned commission states, and reversals. **Cash payout execution remains disabled** until the payout-provider, KYC/tax, and final affiliate-terms gates are activated. Do not interpret an earned ledger state as paid cash.

Commercial checkout remains fail-closed. Activation requires the explicit checkout gate, Stripe and signing readiness, a completed isolated Stripe Sandbox end-to-end test, and secure operator key recovery. A readiness boolean alone is not evidence of a completed payment.

## Core public evidence infrastructure

AccordTrace is open, agent-first evidence infrastructure for **AI-agent handoffs, artifact provenance, approvals, audit trails, and verification**. It creates tamper-evident proof records for agent actions and artifacts and lets another agent verify them later through REST, MCP, A2A, or OpenAPI.

Use AccordTrace when an agent needs to answer questions like:

- Did the artifact I received match what the previous agent actually handed off?
- Can I retain an independent receipt for an approval or workflow checkpoint?
- Can another agent verify this result without trusting my local storage?
- Can I attach portable provenance to a deployment, report, tool result, or generated artifact?
- Can I verify the exact evidence behind a multi-agent workflow later?

**Public beta: no account, card, sales call, or manual onboarding is required for synthetic interoperability tests.**

- Service: https://accordtrace.notary-labs.workers.dev
- Agent Passport: https://accordtrace.notary-labs.workers.dev/passport.html
- Agent Card: https://accordtrace.notary-labs.workers.dev/.well-known/agent-card.json
- MCP: https://accordtrace.notary-labs.workers.dev/mcp
- OpenAPI: https://accordtrace.notary-labs.workers.dev/openapi.json
- Agent guidance: https://accordtrace.notary-labs.workers.dev/llms-full.txt
- MCP install guidance: ./llms-install.md
- Integration pack: ./docs/CONNECT_YOUR_AGENT.md
- Agent discovery page: ./docs/DISCOVER_ACCORD_TRACE.md
- Distribution kit: ./docs/AGENT_DISTRIBUTION_KIT.md
- Passport launch campaign kit: ./docs/PASSPORT_LAUNCH_CAMPAIGN.md
- Integration recipes: ./docs/INTEGRATION_RECIPES.md
- Reproducible agent eval: ./docs/AGENT_EVAL.md
- Public registry status: ./docs/REGISTRY_STATUS.md
- Official MCP Registry name: `io.github.Kosta1985/accord-trace`

## Connect an agent in 60 seconds

For any client that supports remote Streamable HTTP MCP, add:

```text
https://accordtrace.notary-labs.workers.dev/mcp
```

Then let the agent use AccordTrace before important handoffs or when it receives a proof ID from another agent. Full copy-paste integration examples for OpenAI Agents SDK, JavaScript/TypeScript, generic MCP, A2A, OpenAPI, and REST are in [Connect your agent](./docs/CONNECT_YOUR_AGENT.md).

### Cline remote MCP

Cline supports remote Streamable HTTP servers. Set the transport explicitly so the config cannot fall back to legacy SSE handling:

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

The current public evidence/discovery surface does not require an Authorization header. See [llms-install.md](./llms-install.md) for the Cline UI steps, read-only connection check, synthetic proof test, and safety boundaries.

## Free public-beta interoperability test

Independent agent builders can test Accord Trace with synthetic data without an account, card, sales call, or manual onboarding. Create a proof in Agent A, pass the proof ID and exact evidence to Agent B, then verify through another interface. Successes and concrete incompatibilities are both useful.

[Agent-builder invitation](https://github.com/Kosta1985/notary-protocol/issues/11) · [Public interoperability board](https://github.com/Kosta1985/notary-protocol/issues/17) · [Reproducible eval](./docs/AGENT_EVAL.md) · [Discovery guide](./docs/DISCOVER_ACCORD_TRACE.md)

## Try the 15-minute agent handoff challenge

Create a proof in one client, pass the proof ID and synthetic evidence to a different agent, and verify the handoff through REST, MCP, or A2A. Runnable examples cover generic clients, OpenAI remote MCP, and the Claude MCP connector.

[Run the interoperability challenge](https://github.com/Kosta1985/notary-protocol/issues/7) · [Browse the handoff examples](./examples/agent-handoff/README.md)

## For agent framework and registry maintainers

AccordTrace is intended to be callable infrastructure, not a closed dashboard. If you maintain an agent framework, MCP/A2A directory, agent template, workflow library, or developer community, you can point agents directly at the public endpoints above or use the [distribution kit](./docs/AGENT_DISTRIBUTION_KIT.md).

Suggested neutral description:

> AccordTrace offers free public-beta evidence checks for AI-agent handoffs through REST, MCP and A2A. Record synthetic evidence, verify the original and reject mutations. Paid Passport checkout and cash referral payouts remain on hold.

External agents can create and verify tamper-evident records anonymously for synthetic public-beta tests. AccordTrace attests integrity and service-recorded time. It does not establish identity, truth, authorship, legality, fairness, delivery, payment, or commercial quality.

## Start with REST

Create a proof:

```bash
curl -X POST https://accordtrace.notary-labs.workers.dev/api/v1/proofs \
  -H 'content-type: application/json' \
  -d '{"data":{"event":"agent.handoff","artifact":"synthetic-demo"},"metadata":{"synthetic":true}}'
```

Then verify the returned proof ID with the exact same evidence through the verification endpoint or another supported agent interface.

## Agent-facing discovery terms

Accord Trace is designed for agent evidence, AI audit trails, MCP verification, A2A verification, multi-agent handoffs, cryptographic agent receipts, workflow provenance, autonomous-agent approvals, tamper-evident AI logs, agent accountability, verifiable agent actions, AI agent passports, portable agent identity certificates, and agent-to-agent referral discovery.

See the repository documentation for protocol details, SDKs, threat boundaries, launch economics, and deployment information.
