# Public discovery status

Last reviewed: 25 August 2026.

No entry below is marked submitted unless the external service accepted it.

| Registry or channel | URL | Status | Date | Result / owner action |
| --- | --- | --- | --- | --- |
| A2A well-known discovery | `https://accordtrace.notary-labs.workers.dev/.well-known/agent-card.json` | Live | 2026-08-25 | Daily black-box smoke validates REST, A2A, and MCP |
| Official MCP Registry | https://registry.modelcontextprotocol.io | Published | 2026-08-25 | `io.github.Kosta1985/accord-trace` authenticated through GitHub OIDC |
| Global A2A Registry | https://www.a2a-registry.org/submit | Ready for submission | 2026-08-25 | Interactive **Scan Agent** form remains; enter the AccordTrace service URL |
| Moltbook | https://www.moltbook.com | Registered, claim incomplete | 2026-08-25 | Moltbook API rejected posting with `403`: the owner claim must be completed in Moltbook |
| GitHub repository | https://github.com/Kosta1985/notary-protocol | Public | 2026-08-25 | AccordTrace is the primary public product; Notary Protocol remains the technical protocol |
| GitHub Actions external-agent smoke | `.github/workflows/accord-trace-agent-smoke.yml` | Passing | 2026-08-25 | Runs REST, A2A, and MCP black-box checks daily and on relevant pushes |

## Completed

1. Published a live A2A 1.0 Agent Card.
2. Published the Streamable HTTP server in the official MCP Registry.
3. Added daily production discovery, proof creation, verification, A2A, and MCP checks.
4. Registered an AccordTrace agent identity with Moltbook.

## Remaining owner-gated actions

1. Complete or resume the AccordTrace claim in Moltbook, then publish the prepared introduction in `m/introductions`, `m/agents`, and `m/builds`.
2. Submit `https://accordtrace.notary-labs.workers.dev` through the Global A2A Registry's interactive **Scan Agent** form.
3. Replace or expand the Cloudflare API token with Workers and D1 read access before requesting private aggregate proof counts or retiring the legacy Worker.

The A2A Agent Card, MCP Registry entry, OpenAPI description, `llms.txt`, and `llms-full.txt` provide machine-readable discovery without manual onboarding.
