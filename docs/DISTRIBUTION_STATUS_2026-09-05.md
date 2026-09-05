# AccordTrace distribution status — 2026-09-05

This matrix separates **canonical AccordTrace state** from third-party directory caches. A directory listing is a discovery signal only. It is not an endorsement, partnership, identity proof, legal approval, quality guarantee, or evidence that a third party has independently validated every AccordTrace claim.

Canonical service state on this date:

- Production baseline: `24ff514027530eb45c05ef661a77876f3c1d2358`
- Service: `https://accordtrace.notary-labs.workers.dev`
- AccordTrace discovery version: `0.2.1`
- A2A protocol: `1.0`
- Canonical Agent Card: `https://accordtrace.notary-labs.workers.dev/.well-known/agent-card.json`
- Canonical A2A endpoint: `https://accordtrace.notary-labs.workers.dev/a2a`
- Canonical MCP endpoint: `https://accordtrace.notary-labs.workers.dev/mcp`
- Official MCP Registry identity: `io.github.Kosta1985/accord-trace`
- Current canonical Agent Card skills: 8

## Verified matrix

| Surface | Public state checked 2026-09-05 | Endpoint / listing | Freshness assessment | Next action |
| --- | --- | --- | --- | --- |
| AccordTrace canonical service | Live; CI #879, deploy #59, production smoke #90, live contract #50 and Agenstry validator #31 are green on exact production SHA `24ff5140...` | `https://accordtrace.notary-labs.workers.dev` | **Authoritative / current** | Keep exact-SHA deploy verification and release audit green |
| Official MCP Registry | Published as `io.github.Kosta1985/accord-trace` v0.2.1; repository live registry checks validate version/tool publication | `io.github.Kosta1985/accord-trace` | **Current** | Keep registry metadata synchronized with production |
| Glama MCP connector | Public listing exists, reports `Healthy`, Streamable HTTP, repository `Kosta1985/notary-protocol`; public tool snapshot currently shows the original four proof tools | `https://glama.ai/mcp/connectors/io.github.Kosta1985/accord-trace` | **Indexed and healthy; tool snapshot partially stale** | Claim ownership through Glama when convenient; then monitor metadata/tool refresh and quality score |
| A2A Registry | Public listing exists as `dev.workers.accord_trace`; reports A2A 1.0 and canonical manifest URL, but cached card metadata still shows older version/skill state; listing is unclaimed | `https://www.a2a-registry.org/agent/dev.workers.accord_trace` | **Indexed; cached metadata stale** | Claim if ownership flow is useful/available; request/trigger refresh without changing canonical runtime backward |
| Agenstry | Public provider page remains stale while current post-deploy validator succeeds against the live runtime | `https://agenstry.com/providers/Accord%20Trace` | **Public presentation stale; live validator current** | Keep issue #14 open until public index converges |
| Ahel integration catalog | Public catalog includes `accord-trace` from `Kosta1985/notary-protocol` and marks it `Serves today` | `https://ahel.ai/catalog/integrations` | **Independent mirror discovered / current enough to show service availability** | Monitor only; do not imply partnership or endorsement |
| Ahel MCP catalog | Public MCP catalog also includes `accord-trace` and marks it `Serves today` | `https://ahel.ai/catalog/mcp-servers` | **Independent registry mirror** | Monitor only |
| Cline MCP Marketplace submission | Submission issue #2358 is open. AccordTrace now has an explicit Cline remote Streamable HTTP setup in `README.md` and root `llms-install.md`, guarded by `release:audit`; the manual Cline-client test checkbox remains deliberately unchecked because a real Cline runtime test has not yet been reproduced | `https://github.com/cline/mcp-marketplace/issues/2358` | **Install-ready and submitted; not accepted/listed yet; manual client test pending** | Reproduce the documented setup in a real Cline client before checking the external test box; add marketplace asset only if still required |
| LobeHub MCP Marketplace | Fallback request issue #18808 remains open; current maintainer guidance prefers the self-service CLI for listing/claim/update flows | `https://github.com/lobehub/lobehub/issues/18808` | **Requested; not accepted/listed yet** | Complete self-service publication only with an authenticated GitHub-linked session; do not claim listing beforehand |
| Smithery | Outreach/request for indexing guidance previously recorded; no independently visible AccordTrace listing confirmed in this audit | — | **Unconfirmed** | Use authenticated publication flow if/when available; do not claim listing |
| MCP.so | Outreach/request previously recorded; no independently visible AccordTrace listing confirmed in this audit | — | **Unconfirmed** | Re-check submission path before any new request; avoid duplicate/spam submissions |
| PulseMCP | Outreach/request previously recorded; no independently visible AccordTrace listing confirmed in this audit | — | **Unconfirmed** | Re-check current submission/indexing mechanism before any new request |
| MCP.Directory | Public submit page accepts a GitHub repository, optional package fields, optional <=100-character description and optional email; it says official-registry entries may also be auto-discovered and claimable | `https://mcp.directory/submit` | **Legitimate free candidate; listing not independently confirmed** | Search for an auto-ingested listing first; if absent, use the manual free submission path |
| TrackMCP | Public submit page says submission is always free; current form requires public GitHub repository plus a valid contact email; paid featured placement is optional | `https://www.trackmcp.com/submit-mcp` | **Legitimate free candidate; listing not independently confirmed** | Submit manually with an owner-controlled email only if no listing exists |
| MCPServe | Public submission surface and GitHub alternative were discovered, but the submit page was intermittently unavailable during re-check | `https://mcpserve.com/submit` | **Candidate; availability needs re-verification** | Re-check page/repository before any submission; skip if unreliable or paid-only |
| FindMCP | Public submission guidance requires public GitHub repo, English description >=80 chars, connection/install snippet, category, transport and email | `https://findmcp.app/submit` | **Legitimate candidate; remote compatibility must be respected** | Use HTTP/remote details only; do not fabricate a local stdio command if the form rejects remote MCP |
| MCP Market | Public submission accepts GitHub repo or remote MCP plus email. A free queue has been advertised alongside paid expedited placement | `https://mcpmarket.com/submit` | **Free candidate subject to current UI verification** | Use only a visibly free queue; do not buy badge/expedite placement for organic-distribution claims |
| punkpeye/awesome-mcp-servers | Active community list with explicit contribution rules; current guide accepts new server PRs and even documents an agent-PR opt-in suffix | `https://github.com/punkpeye/awesome-mcp-servers` | **Active PR-based free candidate** | Prepare one accurate line in the correct category and publish only through deliberate external-publication action |
| appcypher/awesome-mcp-servers | Repository was archived on 2026-08-01 and is read-only | `https://github.com/appcypher/awesome-mcp-servers` | **Archived / no longer actionable** | Do not spend effort on new submissions |

## Why third-party counts differ

The canonical Agent Card is the source of truth for the current interface. Third-party directories crawl on their own schedules and can retain earlier snapshots after AccordTrace adds skills or changes metadata. A stale directory snapshot must not be used as a reason to regress the production API.

Current canonical skills are:

1. `notarize_evidence`
2. `verify_proof`
3. `get_proof`
4. `hash_content`
5. `network_capabilities`
6. `network_stats`
7. `passport_product_capabilities`
8. `resolve_referral`

## Distribution rules

- Do not buy fake placement or reviews.
- Do not fabricate users, usage, endorsements, partnerships, ratings, acceptance, or directory status.
- Do not mass-post unrelated repositories or communities.
- Do not claim an external marketplace listing until it is independently visible there.
- Preserve canonical URLs and protocol semantics across every listing.
- Treat external directory metrics as third-party observations, not AccordTrace-owned analytics.
- When a directory is stale, update/refresh the directory; do not change production backward to fit the cache.
- Do not fabricate local stdio/npx/uvx install commands for a remote Streamable HTTP server.
- Prefer free organic submission paths; paid featured placement is not evidence of product quality or adoption.

## Reusable submission data

The canonical copy/paste metadata and directory-specific field mapping are maintained in:

`docs/DIRECTORY_SUBMISSION_PACK_2026-09-05.md`

Cline-specific remote setup is maintained in:

`llms-install.md`

## Sources checked

Public pages checked during this audit include:

- Glama AccordTrace connector listing
- A2A Registry Accord Trace listing
- Agenstry Accord Trace provider listing
- Ahel integration and MCP catalogs
- Cline marketplace issue #2358 and current Streamable HTTP configuration guidance
- LobeHub issue #18808 and current maintainer self-service guidance
- MCP.Directory submit page
- TrackMCP submit page
- MCPServe submit page/search result
- FindMCP submit guidance
- MCP Market submit page
- punkpeye/awesome-mcp-servers contribution guide
- appcypher/awesome-mcp-servers archive state

Repository workflow evidence used for canonical state:

- main CI #879
- production deploy #59 with exact-SHA verification
- AccordTrace production smoke #90
- Accord Trace live contract #50
- Agenstry discovery validator #31
- MCP registry validation workflow
