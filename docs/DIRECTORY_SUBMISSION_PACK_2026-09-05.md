# AccordTrace directory submission pack — 2026-09-05

This document is the canonical copy/paste pack for legitimate third-party discovery submissions. It is intentionally conservative: a submission request is not a listing, a listing is not an endorsement, and a directory score is not AccordTrace-owned evidence.

## Canonical product metadata

- Name: `AccordTrace`
- Repository: `https://github.com/Kosta1985/notary-protocol`
- Website: `https://accordtrace.notary-labs.workers.dev`
- Hosted MCP: `https://accordtrace.notary-labs.workers.dev/mcp`
- MCP transport: Streamable HTTP
- Official MCP Registry identity: `io.github.Kosta1985/accord-trace`
- Registry/discovery version: `0.2.1`
- A2A Agent Card: `https://accordtrace.notary-labs.workers.dev/.well-known/agent-card.json`
- A2A endpoint: `https://accordtrace.notary-labs.workers.dev/a2a`
- A2A protocol version: `1.0`
- OpenAPI: `https://accordtrace.notary-labs.workers.dev/openapi.json`
- Agent guidance: `https://accordtrace.notary-labs.workers.dev/llms.txt`
- Extended agent guidance: `https://accordtrace.notary-labs.workers.dev/llms-full.txt`
- Current canonical Agent Card skills: 8
- Production baseline at preparation time: `027ae0f068b118f7fc03bdd3dc8ae20d69b9960d`

## Description variants

### Short — <=100 characters

`Tamper-evident proof creation and verification for AI agents via MCP, A2A and REST.`

### Standard

`AccordTrace creates portable, tamper-evident evidence receipts for AI-agent actions, artifacts, approvals and workflow handoffs, then lets other agents independently verify the exact recorded evidence across MCP, A2A, REST and OpenAPI boundaries.`

### Security-safe extended

`AccordTrace is an open verification and evidence protocol for AI-agent transactions. Agents can create a tamper-evident proof for an action, artifact, approval or handoff and later verify the exact evidence through MCP, A2A, REST or OpenAPI. AccordTrace attests recorded evidence integrity and service-recorded time; it does not establish truth, identity, authority, legality, payment, delivery or commercial quality.`

## Suggested categories / tags

Prefer the closest available legitimate categories rather than forcing unrelated categories.

- Security
- Developer Tools
- AI / Machine Learning
- Agent Infrastructure
- Observability / Audit
- Verification
- Provenance
- Evidence
- MCP
- A2A

## Remote connection data

For directories that support a hosted/remote MCP endpoint:

- Transport: `streamable-http` / Streamable HTTP
- URL: `https://accordtrace.notary-labs.workers.dev/mcp`
- Authentication: none required for the current public proof/discovery surface

Do not invent a local `npx`, `uvx`, Docker or stdio install command for a directory that requires one. AccordTrace's canonical MCP surface is remote Streamable HTTP.

## Current free / legitimate submission targets

### 1. MCP.Directory

Public submit page checked 2026-09-05. It accepts a GitHub repository URL, optional package fields, an optional <=100-character description, and an optional email. The site states that it pulls metadata from GitHub, reviews it, and publishes approved entries. It also notes that entries discovered from the official MCP Registry may already exist and can be claimed separately.

Use:

- GitHub Repository URL: `https://github.com/Kosta1985/notary-protocol`
- npm Package: leave blank unless a future canonical npm package is intentionally published
- PyPI Package: leave blank
- Short Description: use the short description above
- Email: optional; use only an owner-controlled address during a manual submission

Before submitting, search the directory first because official-registry auto-discovery may create the listing without a manual form.

### 2. TrackMCP

Public submit page checked 2026-09-05. Submission is described as free; the current form requires exactly a public GitHub repository and a valid contact email. Featured placement is optional and paid, so it is not required for the free distribution track.

Use:

- GitHub Repository: `https://github.com/Kosta1985/notary-protocol`
- Email: owner-controlled address only during a manual submission

Do not purchase featured placement merely to claim organic adoption.

### 3. MCPServe

A public submission form was discovered with GitHub and website fields plus an alternative GitHub contribution route. The page was intermittently unavailable during the 2026-09-05 re-check, so verify the live submission route immediately before sending anything.

Use only if the current page/repository remains legitimate and free.

### 4. FindMCP

The current public submission guidance requires:

- public GitHub repository
- English description of at least 80 characters
- installation/connection snippet
- category
- transport type
- contact email

Use the standard description above. Select HTTP/Streamable HTTP where supported. If the form strictly requires a Claude Desktop local stdio JSON command rather than a remote HTTP connection, do not fabricate one; skip or ask the directory whether remote MCP servers are accepted.

### 5. MCP Market

The current submission surface accepts a GitHub repository or remote MCP target and an email. A free queue has been advertised alongside paid expedited placement, but the exact free/paid UI can change. Verify that the free route is still visibly available immediately before any submission.

Do not pay for an `Official` badge or faster listing as part of the free-distribution program.

### 6. punkpeye/awesome-mcp-servers

This remains an active community list. Its current `CONTRIBUTING.md` explicitly asks contributors to:

- fork the repository
- add one server line to the appropriate README category
- link the server name to its repository
- use a concise accurate description
- preserve alphabetical order
- open a pull request

Its contribution guide also explicitly supports automated-agent PRs when the PR title ends in `🤖🤖🤖`.

Suggested entry text, adjusted to the exact category/format used at submission time:

`AccordTrace — Tamper-evident proof creation and verification for AI agents via remote MCP, A2A and REST.`

A submission to another repository is an external side effect. Prepare the diff first and publish only through the deliberate external-publication path.

## Targets to avoid or deprioritize

### appcypher/awesome-mcp-servers

The repository was archived on 2026-08-01 and is read-only. Do not spend time preparing a new submission there.

### Duplicate directory requests

Do not repeatedly resubmit Smithery, MCP.so, PulseMCP, Cline or LobeHub while an earlier request, authenticated publication path or indexing process is unresolved. Re-check current state first and avoid duplicate/spam submissions.

## Existing external states

Keep the more detailed evidence matrix in `docs/DISTRIBUTION_STATUS_2026-09-05.md`. At preparation time:

- official MCP Registry: published/current
- Glama: indexed and healthy, public tool snapshot partially stale
- A2A Registry: indexed, cached metadata stale
- Agenstry: validator succeeds but public page remains stale
- Ahel: independent mirror visible
- Cline: submission pending
- LobeHub: request pending; self-service publication preferred
- Smithery / MCP.so / PulseMCP: no independently visible AccordTrace listing confirmed

## Submission truth rules

1. Search the target first; never claim a new listing if it already exists through registry ingestion.
2. Never claim a listing before it is independently visible.
3. Never fabricate reviews, stars, installs, usage, customers, endorsements, quality scores or partnerships.
4. Never submit secrets, API keys, private JWKs, personal data or confidential artifacts.
5. Use only canonical production URLs and current protocol metadata.
6. Do not modify production backward to match a stale third-party crawler.
7. Paid placement is not evidence of product quality or adoption and is outside the free distribution track.
8. Directory analytics are third-party observations, not canonical AccordTrace usage metrics.
9. Keep cash affiliate payouts described as disabled until the separate commercial activation explicitly changes that boundary.
10. Treat public posting/submission as an external side effect and use a deliberate publication action rather than an unattended background workflow.
