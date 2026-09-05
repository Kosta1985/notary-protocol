# AccordTrace distribution status — 2026-09-05

This matrix separates **canonical AccordTrace state** from third-party directory caches. A directory listing is a discovery signal only. It is not an endorsement, partnership, identity proof, legal approval, quality guarantee, or evidence that a third party has independently validated every AccordTrace claim.

Canonical service state on this date:

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
| AccordTrace canonical service | Live; production smoke and live contract green on current production SHA | `https://accordtrace.notary-labs.workers.dev` | **Authoritative / current** | Keep exact-SHA deploy verification and release audit green |
| Official MCP Registry | Published as `io.github.Kosta1985/accord-trace` v0.2.1; repository live registry checks validate version/tool publication | `io.github.Kosta1985/accord-trace` | **Current** | Keep registry metadata synchronized with production |
| Glama MCP connector | Public listing exists, reports `Healthy`, Streamable HTTP, repository `Kosta1985/notary-protocol`; public tool snapshot currently shows the original four proof tools | `https://glama.ai/mcp/connectors/io.github.Kosta1985/accord-trace` | **Indexed and healthy; tool snapshot partially stale** | Claim ownership through Glama when convenient; then monitor metadata/tool refresh and quality score |
| A2A Registry | Public listing exists as `dev.workers.accord_trace`; reports A2A 1.0 and canonical manifest URL, but cached card metadata still shows version 0.2.0 / four original skills; listing is unclaimed | `https://www.a2a-registry.org/agent/dev.workers.accord_trace` | **Indexed; cached metadata stale** | Claim if ownership flow is useful/available; request/trigger refresh without changing canonical runtime backward |
| Agenstry | Public provider page reports alive / 100% uptime but still displays four skills, 80% quality and `Live JSON-RPC 0` | `https://agenstry.com/providers/Accord%20Trace` | **Public presentation stale** | Keep issue #14 open; rely on current successful validator workflow as runtime evidence and wait/request index convergence |
| Ahel integration catalog | Public catalog includes `accord-trace` from `Kosta1985/notary-protocol` and marks it `Serves today` | `https://ahel.ai/catalog/integrations` | **Independent mirror discovered / current enough to show service availability** | Monitor only; do not imply partnership or endorsement |
| Ahel MCP catalog | Public MCP catalog also includes `accord-trace` and marks it `Serves today` | `https://ahel.ai/catalog/mcp-servers` | **Independent registry mirror** | Monitor only |
| Cline MCP Marketplace submission | Submission issue #2358 is open. README-only Cline setup checkbox remains deliberately unchecked because that exact Cline-specific install test has not been reproduced | `https://github.com/cline/mcp-marketplace/issues/2358` | **Submitted; not accepted/listed yet** | Reproduce a real Cline setup from README/agent install guidance before checking the box; add marketplace asset if required |
| LobeHub MCP Marketplace | Fallback request issue #18808 remains open; LobeHub self-service CLI/browser-login route is still the preferred publication path described in the request | `https://github.com/lobehub/lobehub/issues/18808` | **Requested; not accepted/listed yet** | Complete self-service publication only with an authenticated GitHub-linked session; do not claim listing beforehand |
| Smithery | Outreach/request for indexing guidance previously recorded; no independently visible AccordTrace listing confirmed in this audit | — | **Unconfirmed** | Use authenticated publication flow if/when available; do not claim listing |
| MCP.so | Outreach/request previously recorded; no independently visible AccordTrace listing confirmed in this audit | — | **Unconfirmed** | Re-check submission path before any new request; avoid duplicate/spam submissions |
| PulseMCP | Outreach/request previously recorded; no independently visible AccordTrace listing confirmed in this audit | — | **Unconfirmed** | Re-check current submission/indexing mechanism before any new request |

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

## Sources checked

Public pages checked during this audit:

- Glama AccordTrace connector listing
- A2A Registry Accord Trace listing
- Agenstry Accord Trace provider listing
- Ahel integration and MCP catalogs
- Cline marketplace issue #2358
- LobeHub issue #18808

Repository workflow evidence used for canonical state:

- production exact-SHA deployment verification
- AccordTrace production smoke
- Accord Trace live contract
- Agenstry discovery validator workflow
- MCP registry validation workflow
