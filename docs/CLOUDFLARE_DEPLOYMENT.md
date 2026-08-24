# Public deployment on Cloudflare

This deployment provides a public `workers.dev` URL without buying a domain. It uses Cloudflare Workers for the application, D1 for durable receipts, and a Worker secret for the notary signing key.

## 1. Requirements

- A free Cloudflare account
- Node.js 20 or newer
- The Notary Protocol project archive or repository

No payment method or custom domain is required for the initial deployment.

## 2. Open a terminal in the project

Extract the archive, then enter its directory:

```bash
cd notary-protocol
npm test
```

All tests should pass before deployment.

## 3. Sign in to Cloudflare

```bash
npx wrangler@latest login
```

The command opens Cloudflare in the browser. Sign in and approve Wrangler access. If Cloudflare asks to create a `workers.dev` account subdomain, choose a short permanent name. This becomes the final part of the public URL.

## 4. Create the receipt database

For an Australia-based deployment, use the Oceania location hint:

```bash
npx wrangler@latest d1 create notary-protocol --location=oc
```

The command prints a `database_id`. Copy only that identifier and configure the project:

```bash
node scripts/configure-cloudflare.js YOUR_DATABASE_ID
```

Confirm that `wrangler.jsonc` no longer contains `REPLACE_WITH_D1_DATABASE_ID`.

## 5. Apply the database migration

```bash
npx wrangler@latest d1 migrations apply notary-protocol --remote
```

Approve the operation when prompted. This creates the durable `receipts` table and its indexes.

## 6. Create the notary signing key

Prepare the static verifier assets first:

```bash
npm run cf:prepare
```

Generate an Ed25519 private key and send it directly to Cloudflare's encrypted secret store:

```bash
node scripts/generate-notary-jwk.js | npx wrangler@latest secret put NOTARY_PRIVATE_JWK
```

Do not save, paste into chat, or commit the generated private JWK. Cloudflare stores the secret and exposes it only to the Worker runtime.

## 7. Deploy

```bash
npm run cf:deploy
```

Wrangler uploads the Worker and static verifier. At the end it prints a URL similar to:

```text
https://notary-protocol.YOUR_SUBDOMAIN.workers.dev
```

That output is the real public link. It will open from any device.

## 8. Verify the public product

Open the printed URL and perform this test:

1. Select `Load signed demo`.
2. Select `Verify envelope`.
3. Confirm that all 16 evidence checks pass.
4. Confirm `Notary signature: Valid · checked locally`.
5. Download the receipt.
6. Copy its `ntr_…` identifier into `Retrieve a stored receipt` and select `Find receipt`.
7. Change one character inside `offer.terms` and verify again. Both party signature checks should fail.

Also open these public endpoints, replacing `YOUR_URL` with the deployment URL:

```text
YOUR_URL/health
YOUR_URL/openapi.json
YOUR_URL/v1/notary-key
YOUR_URL/.well-known/agent-card.json
```

## 9. Future updates

Keep the same Cloudflare project, D1 database binding, and `NOTARY_PRIVATE_JWK` secret. To publish code changes:

```bash
npm test
npm run cf:deploy
```

Do not generate a new notary key during ordinary deployments. Changing it invalidates trust in receipts against the newly published key.

## 10. Optional custom domain

The `workers.dev` URL is sufficient for testing and an initial MVP. A custom domain can be connected later from the Worker's **Settings → Domains & Routes** page without changing the application.
