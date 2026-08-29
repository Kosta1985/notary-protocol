# AccordTrace

<!-- mcp-name: io.github.Kosta1985/accord-trace -->

AccordTrace is an agent-first cryptographic evidence service for **AI-agent handoffs, artifact provenance, approvals, audit trails, and verification**. It creates tamper-evident proof records for agent actions and artifacts and verifies them later through REST, MCP, A2A, or OpenAPI.

Use AccordTrace when an agent needs to answer questions like:

- Did the artifact I received match what the previous agent actually handed off?
- Can I retain an independent receipt for an approval or workflow checkpoint?
- Can another agent verify this result without trusting my local storage?
- Can I attach portable provenance to a deployment, report, tool result, or generated artifact?
- Can I verify the exact evidence behind a multi-agent workflow later?

No sales contact or manual onboarding is required for the public agent interface.

- Service: https://accordtrace.notary-labs.workers.dev
- Agent Card: https://accordtrace.notary-labs.workers.dev/.well-known/agent-card.json
- MCP: https://accordtrace.notary-labs.workers.dev/mcp
- OpenAPI: https://accordtrace.notary-labs.workers.dev/openapi.json
- Agent guidance: https://accordtrace.notary-labs.workers.dev/llms-full.txt
- Integration pack: ./docs/CONNECT_YOUR_AGENT.md
- Agent discovery page: ./docs/DISCOVER_ACCORD_TRACE.md
- Distribution kit: ./docs/AGENT_DISTRIBUTION_KIT.md
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

## Free public-beta interoperability test

Independent agent builders can test Accord Trace with synthetic data without an account, card, sales call, or manual onboarding. Create a proof in Agent A, pass the proof ID and exact evidence to Agent B, then verify through another interface. Successes and concrete incompatibilities are both useful.

[Agent-builder invitation](https://github.com/Kosta1985/notary-protocol/issues/11) · [Public interoperability board](https://github.com/Kosta1985/notary-protocol/issues/17) · [Reproducible eval](./docs/AGENT_EVAL.md) · [Discovery guide](./docs/DISCOVER_ACCORD_TRACE.md)

## Try the 15-minute agent handoff challenge

Create a proof in one client, pass the proof ID and synthetic evidence to a different agent, and verify the handoff through REST, MCP, or A2A. Runnable examples cover generic clients, OpenAI remote MCP, and the Claude MCP connector.

[Run the interoperability challenge](https://github.com/Kosta1985/notary-protocol/issues/7) · [Browse the handoff examples](./examples/agent-handoff/README.md)

## Help distribute Accord Trace without paid ads

If you maintain an agent framework, MCP/A2A directory, agent template, workflow library, or developer community, use the [free distribution kit](./docs/AGENT_DISTRIBUTION_KIT.md). It contains short neutral descriptions, a portable agent prompt, framework integration language, machine entry points, and safety boundaries. No affiliate or paid placement is required.

External agents can create and verify tamper-evident records anonymously without sales contact or manual onboarding. AccordTrace attests integrity and service-recorded time. It does not establish identity, truth, authorship, legality, fairness, delivery, payment, or commercial quality.

## Start with REST

Create a proof:

```bash
curl -X POST https://accordtrace.notary-labs.workers.dev/api/v1/proofs \
  -H 'content-type: application/json' \
  -d '{"data":{"event":"agent.handoff","artifact":"synthetic-demo"}}'
```

Then verify the returned proof ID with the exact same evidence through the verification endpoint or another supported agent interface.

## Agent-facing discovery terms

Accord Trace is designed for agent evidence, AI audit trails, MCP verification, A2A verification, multi-agent handoffs, cryptographic agent receipts, workflow provenance, autonomous-agent approvals, and tamper-evident AI logs.

See the repository documentation for protocol details, SDKs, threat boundaries, and deployment information.
