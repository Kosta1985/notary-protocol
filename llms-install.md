# Install AccordTrace in an MCP client

AccordTrace exposes a hosted **Streamable HTTP** MCP endpoint:

`https://accordtrace.notary-labs.workers.dev/mcp`

The current public evidence/discovery surface does not require an API key.

## Cline

Current Cline documentation recommends Streamable HTTP for remote MCP servers. When editing JSON manually, set the transport type explicitly; omitting the type can be interpreted as legacy SSE by older/backward-compatible config handling.

### Cline UI

1. Open **MCP Servers** in Cline.
2. Choose **Add Remote Server**.
3. Name it `accordtrace`.
4. Set the server URL to `https://accordtrace.notary-labs.workers.dev/mcp`.
5. Choose **Streamable HTTP**.
6. Save with tool auto-approval disabled unless you intentionally want to allow a specific read-only tool.

### Cline JSON

```json
{
  "mcpServers": {
    "accordtrace": {
      "type": "streamableHttp",
      "url": "https://accordtrace.notary-labs.workers.dev/mcp",
      "disabled": false,
      "autoApprove": []
    }
  }
}
```

No `Authorization` header is required for the current public proof/discovery surface.

### Read-only connection check

After Cline shows the server as connected, ask it to list the AccordTrace tools and run a read-only discovery call such as `accord_trace_network_capabilities`.

Expected high-level policy signals include:

- model: `single_level_direct_product_referral`
- Agent Passport Certificate launch price: US$2
- qualifying direct referral commission: US$1
- one referral level only
- no self-referral
- cash affiliate payouts disabled

A successful connection test proves MCP interoperability only. It is not an endorsement, identity proof, legal approval, payment confirmation or commercial-quality guarantee.

### Optional synthetic proof test

Use synthetic public data only. For example:

```json
{
  "task": "cline-accordtrace-interoperability",
  "status": "complete"
}
```

Ask Cline to create an AccordTrace proof, retain the returned proof ID, then verify that same exact evidence. Mutating the evidence should fail the hash comparison.

Do not put credentials, private keys, personal data or confidential artifacts into public interoperability tests.

## Other remote MCP clients

For any client that supports remote Streamable HTTP MCP, use:

- URL: `https://accordtrace.notary-labs.workers.dev/mcp`
- Transport: Streamable HTTP
- Authentication: none for the current public proof/discovery surface

Do not invent an `npx`, `uvx`, Docker or stdio command for AccordTrace when a directory or client expects a local process. The canonical MCP service is hosted remotely.

## Additional discovery

- Service: `https://accordtrace.notary-labs.workers.dev`
- Official MCP Registry: `io.github.Kosta1985/accord-trace`
- Agent Card: `https://accordtrace.notary-labs.workers.dev/.well-known/agent-card.json`
- OpenAPI: `https://accordtrace.notary-labs.workers.dev/openapi.json`
- Agent guidance: `https://accordtrace.notary-labs.workers.dev/llms-full.txt`
