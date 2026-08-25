# Notary Protocol

<!-- mcp-name: io.github.kosta1985/accord-trace -->

## Accord Trace agent service

Accord Trace is the live agent-first evidence service built on this protocol repository.

- Service: https://accordtrace.notary-labs.workers.dev
- Agent Card: https://accordtrace.notary-labs.workers.dev/.well-known/agent-card.json
- MCP: https://accordtrace.notary-labs.workers.dev/mcp
- OpenAPI: https://accordtrace.notary-labs.workers.dev/openapi.json
- Agent guidance: https://accordtrace.notary-labs.workers.dev/llms.txt

External agents can create and verify tamper-evident records anonymously without sales contact or manual onboarding. Accord Trace attests integrity and service-recorded time; it does not establish that an underlying claim is true or legally valid.


Open cryptographic verification and evidence protocol for transactions between AI agents.

**Live verifier:** https://notary-protocol.notary-labs.workers.dev

**Source:** https://github.com/Kosta1985/notary-protocol

**Public activity:** https://notary-protocol.notary-labs.workers.dev/v1/stats

**Free early access through 24 November 2026:** https://notary-protocol.notary-labs.workers.dev/pilot.html

Notary turns a signed `DealEnvelope` into a portable `NotaryReceipt`:

`Agent A -> Offer -> Agent B -> Acceptance -> Signatures -> Notary Verification -> Notary Receipt`

It verifies structure, linkage, timestamps and Ed25519 signatures. It never decides whether a transaction is commercially or legally good.

## Included

- Protocol specification and JSON Schemas
- Dependency-free Node.js verification API
- Web verification interface and product landing page
- TypeScript and Python SDKs
- MCP stdio adapter
- A2A task adapter and agent card
- OpenAPI description, deployment notes and automated tests
- Anonymous aggregate usage counters with no user identifiers
- Published conformance vectors and runnable integration examples

## Quick start

Requires Node.js 20 or newer. There are no runtime package dependencies.

```bash
npm start
```

Open `http://127.0.0.1:8787`, choose **Load signed demo**, then **Verify envelope**.
The result panel verifies the notary signature locally and can copy or download the receipt. A stored receipt can be retrieved by its `ntr_…` identifier from the same workspace.

Container launch:

```bash
docker compose up --build
```

Public deployment without buying a domain:

```bash
npx wrangler@latest login
npx wrangler@latest d1 create notary-protocol --location=oc
# Configure the returned database ID, apply the migration, add the signing secret,
# then deploy as described in docs/CLOUDFLARE_DEPLOYMENT.md.
```

Cloudflare deployment uses Workers, D1 durable storage, static assets, and an encrypted Ed25519 signing secret. The complete step-by-step guide is in `docs/CLOUDFLARE_DEPLOYMENT.md`.

Run the test suite:

```bash
npm test
```

Generate a signed example on the command line:

```bash
npm run demo
```

Check the deployed service and print its aggregate adoption report:

```bash
npm run smoke:live
npm run adoption:report
```

## API

```bash
curl http://127.0.0.1:8787/health
curl http://127.0.0.1:8787/v1/demo > envelope.json
curl -X POST http://127.0.0.1:8787/v1/verify \
  -H 'content-type: application/json' \
  --data-binary @envelope.json
```

Endpoints:

- `POST /v1/verify` verifies an envelope and persists the signed result.
- `GET /v1/receipts/{id}` retrieves a receipt.
- `POST /v1/receipts/verify` verifies a receipt signature against this notary key.
- `GET /v1/notary-key` publishes the notary verification key.
- `GET /v1/capabilities` publishes supported versions, cryptography, limits and endpoints.
- `GET /v1/demo` creates a short-lived signed example.
- `GET /openapi.json` serves the API description.
- `POST /a2a` accepts an A2A JSON-RPC message containing a DealEnvelope.

## Repository

```text
protocol/       Specification and schemas
api/            Verification service and tests
web/            Landing page and live verifier
sdk/            TypeScript and Python clients
adapters/       MCP and A2A integrations
docs/           API and deployment documentation
cloudflare/      Public Workers + D1 runtime and migrations
examples/        Runnable public integration examples
```

## Community

- `CONTRIBUTING.md` explains protocol and implementation contributions.
- `SECURITY.md` defines private vulnerability reporting expectations.
- `ROADMAP.md` lists the path from public beta to a stable core.
- `docs/AGENT_INTEGRATION.md` is the shortest agent integration guide.
- `docs/EARLY_ADOPTER_GUIDE.md` lists practical first integrations and requested feedback.
- `docs/COMMERCIAL_PILOT.md` defines free early access and the future bulk-export pricing hypothesis.
- `docs/REVENUE_SETUP_AU.md` covers the operational path for invoicing the first Australian pilot.
- `docs/PUBLISHING.md` covers the deployment and public-launch sequence.
- `docs/LAUNCH_KIT.md` contains accurate public-beta messaging.
- `protocol/test-vectors/` contains canonical payload, digest and signature fixtures.

## Production

Persist `api/data` on durable storage and protect the generated `notary-key.pem`. Put the service behind TLS, set `CORS_ORIGIN`, and apply deployment-specific authentication and retention rules. See `docs/DEPLOYMENT.md`.

The scheduled live smoke workflow runs every six hours. Synthetic checks identify themselves to the service and are excluded from aggregate activity counters.

## License

MIT
