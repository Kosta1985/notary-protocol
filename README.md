# Notary Protocol

Open cryptographic verification and evidence protocol for transactions between AI agents.

**Live verifier:** https://notary-protocol.notary-labs.workers.dev

**Source:** https://github.com/Kosta1985/notary-protocol

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
```

## Production

Persist `api/data` on durable storage and protect the generated `notary-key.pem`. Put the service behind TLS, set `CORS_ORIGIN`, and apply deployment-specific authentication and retention rules. See `docs/DEPLOYMENT.md`.

## License

MIT
