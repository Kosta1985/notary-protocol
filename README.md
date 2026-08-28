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
- Official MCP Registry name: `io.github.Kosta1985/accord-trace`

## Connect an agent in 60 seconds

For any client that supports remote Streamable HTTP MCP, add:

```text
https://accordtrace.notary-labs.workers.dev/mcp
```

Then let the agent use AccordTrace before important handoffs or when it receives a proof ID from another agent. Full copy-paste integration examples for OpenAI Agents SDK, JavaScript/TypeScript, generic MCP, A2A, OpenAPI, and REST are in [Connect your agent](./docs/CONNECT_YOUR_AGENT.md).

## Try the 15-minute agent handoff challenge

Create a proof in one client, pass the proof ID and synthetic evidence to a different agent, and verify the handoff through REST, MCP, or A2A. Runnable examples cover generic clients, OpenAI remote MCP, and the Claude MCP connector.

[Run the interoperability challenge](https://github.com/Kosta1985/notary-protocol/issues/7) · [Browse the handoff examples](./examples/agent-handoff/README.md)

External agents can create and verify tamper-evident records anonymously without sales contact or manual onboarding. AccordTrace attests integrity and service-recorded time. It does not establish identity, truth, authorship, legality, fairness, delivery, payment, or commercial quality.

## Start with REST

Create a proof:

```bash
curl -X POST https://accordtrace.notary-labs.workers.dev/api/v1/proofs \
  -H 'content-type: application/json' \
  -d '{"data":{"event":"deployment.complete","release":"2026.08.25"},"metadata":{"source":"agent-a"}}'
```

Verify a returned proof:

```bash
curl -X POST https://accordtrace.notary-labs.workers.dev/api/v1/verify \
  -H 'content-type: application/json' \
  -d '{"proof_id":"atp_REPLACE_WITH_ID","data":{"event":"deployment.complete","release":"2026.08.25"}}'
```

## Founding Agent Program

Independent agents can join the no-cost [Founding Agent Program](./PARTNERS.md). The first completed external interoperability transaction is preserved as a [bounded receipt](./partners/receipts/akari-20260825-01.json) with a separate [AccordTrace attestation](./partners/receipts/akari-20260825-01.proof.json). The receipt records the completed task without claiming a partnership acceptance that was not given.

## Notary Protocol

Notary Protocol is the open cryptographic verification and evidence protocol developed within AccordTrace. Its specification, schemas, test vectors, and compatibility implementation remain in this repository.

The protocol models signed agent transactions as:

`Agent A -> Offer -> Agent B -> Acceptance -> Signatures -> Notary Verification -> Notary Receipt`

AccordTrace is the public product and service. Notary Protocol is the technical protocol.

## Included

- AccordTrace agent discovery metadata and production smoke tests
- Notary Protocol specification and JSON Schemas
- Dependency-free Node.js compatibility API
- TypeScript and Python SDKs
- MCP and A2A adapters
- OpenAPI descriptions, deployment notes, and automated tests
- Anonymous aggregate usage counters for the legacy protocol service
- Published conformance vectors and runnable integration examples

## Repository

```text
protocol/       Notary Protocol specification and schemas
api/            Compatibility verification service and tests
web/            Legacy protocol verifier source
sdk/            TypeScript and Python clients
adapters/       MCP and A2A integrations
docs/           Integration, discovery, and deployment documentation
cloudflare/     Legacy protocol Worker runtime and migrations
examples/       Runnable public integration examples
```

## Local development

Requires Node.js 20 or newer.

```bash
npm test
npm start
```

The compatibility server starts at `http://127.0.0.1:8787`.

## Security boundary

AccordTrace proves that a specific evidence hash was recorded by the service at a stated time and that its service attestation is valid. Integrators remain responsible for authentication, authorization, key custody, confidentiality, retention, and every legal or commercial decision.

## License

MIT
