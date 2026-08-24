# Publishing and launch runbook

This runbook updates the existing Cloudflare deployment without replacing its
D1 database binding.

## Deploy aggregate activity metrics

From the project directory in Windows PowerShell:

```powershell
node .\scripts\enable-analytics.js
npx.cmd wrangler@latest d1 migrations apply notary-protocol --remote
npm.cmd test
npm.cmd run cf:deploy
```

Confirm the migration when Wrangler asks. The migration is additive: it creates
the `analytics_daily` table and does not alter stored receipts.

## Verify the deployment

Open these public URLs:

- `https://notary-protocol.notary-labs.workers.dev/health`
- `https://notary-protocol.notary-labs.workers.dev/v1/capabilities`
- `https://notary-protocol.notary-labs.workers.dev/v1/stats`
- `https://notary-protocol.notary-labs.workers.dev/activity.html`
- `https://notary-protocol.notary-labs.workers.dev/privacy.html`
- `https://notary-protocol.notary-labs.workers.dev/llms.txt`

The stats endpoint reports daily aggregate events only. It does not store IP
addresses, user agents, cookies, fingerprints or submitted envelope contents.

Run the complete public verification flow and print the current adoption report:

```powershell
npm.cmd run smoke:live
npm.cmd run adoption:report
```

The scheduled GitHub workflow performs the same smoke test every six hours.
Synthetic checks are excluded from activity totals. Before this update is live,
the workflow automatically uses health-only mode.

## Notify search engines

After the key file and sitemap are live:

```powershell
node .\scripts\submit-indexnow.js
```

An HTTP `200` response means the URLs were accepted. A first submission can
return `202` while the key is being validated.

## Publish the MCP adapter

Publishing requires an npm account and an authenticated local npm client.

```powershell
cd adapters\mcp
npm.cmd login
npm.cmd publish --access public
```

After npm publication, submit `adapters/mcp/server.json` to the official MCP
Registry using its current publisher CLI. Do not publish before reviewing the
package name, owner namespace and public metadata.

## Public launch sequence

1. Deploy and complete the verification checks above.
2. Run IndexNow once.
3. Publish the MCP package and registry entry when npm ownership is available.
4. Use the copy in `docs/LAUNCH_KIT.md` for one relevant launch channel at a
   time.
5. Link technical discussions to GitHub issues and record actionable protocol
   feedback there.
6. Review `/activity.html` after 24 hours and after 7 days. Treat low traffic as
   a distribution signal, not as evidence about protocol correctness.

Do not buy traffic, automate unsolicited posts, coordinate votes or claim legal
validity, identity verification, immutability or production certification.
