# AccordTrace production architecture

Status: audit in progress, 2026-08-26.

## Known production surface

- Production hostname: `https://accordtrace.notary-labs.workers.dev`
- Public product: **AccordTrace**
- Known public transports: REST, A2A and MCP.
- Known REST product routes: `POST /api/v1/proofs`, `GET /api/v1/proofs/{proof_id}`, `POST /api/v1/verify`.
- Known public discovery: Agent Card, OpenAPI and `llms.txt`.
- Known signing family: ES256 with public JWKS.

## Repository state discovered during the audit

The repository currently contains a legacy Cloudflare configuration whose Worker name is `notary-protocol`, entry point is `cloudflare/src/index.js`, asset directory is `cloudflare/public`, and D1 binding is `DB` targeting database name `notary-protocol` (with the database id intentionally represented by a placeholder in version control).

That configuration does **not** by itself establish that it is the source currently serving `accordtrace.notary-labs.workers.dev`. The repository also contains AccordTrace-specific workflows and documentation. Production provenance therefore remains a P0 item until the active Cloudflare Worker inventory/deployment metadata is reconciled with repository source.

## Production source-of-truth checklist

| Item | Current audit result |
| --- | --- |
| Production hostname | `accordtrace.notary-labs.workers.dev` |
| Worker name | **Unverified from Cloudflare inventory** |
| Exact deployed commit | **Unverified** |
| AccordTrace API source directory | **Unverified** |
| Build command | **Unverified for active AccordTrace Worker** |
| Wrangler config | Legacy `wrangler.jsonc` exists; active AccordTrace config **unverified** |
| Database bindings | Active production bindings **unverified** |
| Asset source | Active production asset source **unverified** |
| Deployment pipeline | Active production deploy origin **unverified** |
| Signing private-key variable | Secret value must never be recorded; active variable mapping **unverified** |
| Public JWKS | Production is known to expose JWKS; exact source/build provenance **unverified** |
| Rollback | Must use Cloudflare deployment/version rollback only after active Worker/version is identified |

## Legacy implementation currently represented in GitHub

`wrangler.jsonc` describes:

- Worker: `notary-protocol`
- Main: `cloudflare/src/index.js`
- Assets: `cloudflare/public`
- D1 binding: `DB`
- D1 database name: `notary-protocol`
- Routes include `/health`, `/v1/*`, `/a2a`, `/openapi.json`, and `/.well-known/*`.

This is the **Notary Protocol compatibility/legacy implementation** unless and until Cloudflare inventory proves otherwise. It must not be presented as the AccordTrace production source without evidence.

## Required reconciliation

1. Inventory Cloudflare Workers for the account.
2. Identify the script bound to `accordtrace.notary-labs.workers.dev`.
3. Record its deployment/version metadata.
4. Inventory its D1/KV/R2/service bindings without exposing secret values.
5. Compare deployed modules/assets against repository candidates.
6. Identify the exact repository commit or document deployment drift.
7. If production code is absent from GitHub, recover it into a clearly named AccordTrace source directory before modifying production.
8. Only then establish `main -> test -> build -> deploy -> smoke` as the reproducible production path.

## Safety rules

- Do not rotate or replace signing keys merely to simplify deployment.
- Do not delete existing proofs.
- Preserve verification of historical proofs and retain public keys needed for them.
- Never commit Cloudflare tokens, private JWKs, D1 credentials, GitHub secrets, or other authentication material.
- Do not deploy the legacy Worker over AccordTrace until source-of-truth reconciliation is complete.
