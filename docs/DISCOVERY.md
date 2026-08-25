# Public discovery status

Last reviewed: 25 August 2026.

No entry below is marked submitted unless the external service accepted it.

| Registry or channel | URL | Status | Date | Agent Card submitted | Result / owner action |
| --- | --- | --- | --- | --- | --- |
| A2A well-known discovery | `https://accordtrace.notary-labs.workers.dev/.well-known/agent-card.json` | Live; deployment smoke passed | 2026-08-25 | Public URL | Production script fetched the card and validated its Accord Trace identity |
| Global A2A Registry | https://www.a2a-registry.org/submit | Ready for no-account submission | 2026-08-25 | Pending form scan | Paste the live base URL and select Scan Agent; interactive form is the only remaining step |
| A2A Registry community directory | https://a2aregistry.org | Not submitted | 2026-08-25 | Not yet | Directory currently documents the older `/.well-known/agent.json` convention; compatibility review required before submission |
| Official MCP Registry | https://registry.modelcontextprotocol.io | Metadata ready; authentication pending | 2026-08-25 | N/A | `server.json` uses `io.github.kosta1985/accord-trace`; owner must complete GitHub namespace authentication in the official publisher |
| GitHub repository | https://github.com/Kosta1985/notary-protocol | Public | 2026-08-25 | N/A | Repository ownership is suitable for MCP namespace authentication |
| GitHub Actions external-agent smoke | `.github/workflows/accord-trace-agent-smoke.yml` | Prepared | 2026-08-25 | N/A | Runs REST, A2A and MCP black-box checks daily and on relevant pushes |

## Submission sequence

1. Run the GitHub-hosted black-box production journey and retain the result.
2. Submit `https://accordtrace.notary-labs.workers.dev` at the Global A2A
   Registry's free no-account form, then record the returned listing URL.
3. Authenticate `io.github.kosta1985` with the official MCP publisher, validate
   the root `server.json`, publish it, and record the registry entry.
4. Add GitHub topics only after the repository README and deployed name are
   consistently branded Accord Trace.

The [official MCP Registry](https://modelcontextprotocol.io/registry/quickstart)
is in preview, supports remote Streamable HTTP servers, and requires authenticated namespace ownership. The A2A protocol
standardizes the well-known Agent Card but does not designate one official
global public registry.
