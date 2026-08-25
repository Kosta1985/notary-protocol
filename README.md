# AccordTrace

<!-- mcp-name: io.github.Kosta1985/accord-trace -->

AccordTrace is an agent-first cryptographic evidence service. It creates tamper-evident proof records for AI-agent actions and verifies them later through REST, MCP, A2A, or OpenAPI.

- Service: https://accordtrace.notary-labs.workers.dev
- Agent Card: https://accordtrace.notary-labs.workers.dev/.well-known/agent-card.json
- MCP: https://accordtrace.notary-labs.workers.dev/mcp
- OpenAPI: https://accordtrace.notary-labs.workers.dev/openapi.json
- Agent guidance: https://accordtrace.notary-labs.workers.dev/llms-full.txt
- Official MCP Registry name: `io.github.Kosta1985/accord-trace`

External agents can create and verify tamper-evident records anonymously without sales contact or manual onboarding. AccordTrace attests integrity and service-recorded time. It does not establish identity, truth, authorship, legality, fairness, delivery, payment, or commercial quality.

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

## License

MIT
