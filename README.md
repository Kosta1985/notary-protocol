# AccordTrace

<!-- mcp-name: io.github.Kosta1985/accord-trace -->

AccordTrace is an agent-first cryptographic evidence service. It creates tamper-evident proof records for AI-agent actions, artifacts, approvals, and workflow handoffs, then verifies them through REST, MCP, A2A, OpenAPI, OpenAI, or Claude.

- Service: https://accordtrace.notary-labs.workers.dev
- Agent Card: https://accordtrace.notary-labs.workers.dev/.well-known/agent-card.json
- MCP: https://accordtrace.notary-labs.workers.dev/mcp
- OpenAPI: https://accordtrace.notary-labs.workers.dev/openapi.json
- Agent guidance: https://accordtrace.notary-labs.workers.dev/llms-full.txt
- Official MCP Registry name: `io.github.Kosta1985/accord-trace`
- A2A Registry: https://www.a2a-registry.org/agent/dev.workers.accord_trace

External agents can create and verify tamper-evident records anonymously without sales contact or manual onboarding. AccordTrace attests integrity and service-recorded time. It does not establish identity, truth, authorship, legality, fairness, delivery, payment, or commercial quality.

## Use AccordTrace when

- one AI agent hands an artifact or task result to another agent;
- a deployment, approval, API result, or workflow checkpoint may need later integrity verification;
- an orchestrator needs a portable proof ID before continuing a high-value workflow;
- an OpenAI or Claude agent needs a remote MCP tool to verify received evidence;
- a multi-agent system needs an independent tamper-evident receipt without sharing the underlying private artifact.

Common discovery intents: **AI agent audit trail**, **MCP verification server**, **agent handoff receipt**, **cryptographic proof for AI workflows**, **tamper-evident agent evidence**, and **A2A integrity verification**.

## Start in 60 seconds

1. Create a proof with the public REST example below.
2. Verify it later using the returned proof ID.
3. For an agent integration, discover the [Agent Card](https://accordtrace.notary-labs.workers.dev/.well-known/agent-card.json) or connect the [MCP endpoint](https://accordtrace.notary-labs.workers.dev/mcp).
4. Run the [production handoff examples](./examples/agent-handoff/README.md) for REST, MCP, A2A, OpenAI, and Claude.

Independent agents can join the no-cost [Founding Agent Program](./PARTNERS.md). The first completed external interoperability transaction is preserved as a [bounded receipt](./partners/receipts/akari-20260825-01.json) with a separate [AccordTrace attestation](./partners/receipts/akari-20260825-01.proof.json). The receipt records the completed task without claiming a partnership acceptance that was not given.

## Notary Protocol

Notary Protocol is the open cryptographic verification and evidence protocol developed within AccordTrace. Its specification, schemas, test vectors, and compatibility implementation remain in this repository.

The protocol models signed agent transactions as:

`Agent A -> Offer -> Agent B -> Acceptance -> Signatures -> Notary Verification -> Notary Receipt`

AccordTrace is the public product and service. Notary Protocol is the technical protocol.

## Agent quick start

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

## Share and integrate

Use the [launch kit](./docs/LAUNCH_KIT.md) for factual directory descriptions, community posts, and agent prompts. Do not describe AccordTrace as legal notarization, identity verification, truth verification, or proof that a real-world event occurred.

## License

MIT
