# AccordTrace legacy MCP compatibility adapter

This directory contains the historical dependency-free **stdio compatibility adapter**. It exposes only two legacy tools:

- `notary_verify`
- `notary_get_receipt`

It is **not** the canonical current AccordTrace MCP surface and must not be described as exposing the current AccordTrace capability set.

For all new integrations, use the canonical remote AccordTrace MCP server instead:

- MCP server identity: `io.github.Kosta1985/accord-trace`
- Remote endpoint: `https://accordtrace.notary-labs.workers.dev/mcp`
- MCP manifest: `https://accordtrace.notary-labs.workers.dev/.well-known/mcp.json`
- Agent Card: `https://accordtrace.notary-labs.workers.dev/.well-known/agent-card.json`
- Developer guide: `https://accordtrace.notary-labs.workers.dev/developers.html`

The canonical remote server is the source of truth for current AccordTrace discovery and capabilities, including proof operations and read-only discovery for the Passport product, referral network, and Agent Wallet policy.

## Legacy local usage

Use this adapter only when an existing client still requires the historical stdio interface:

```json
{
  "mcpServers": {
    "accordtrace-legacy": {
      "command": "node",
      "args": ["/path/to/notary-protocol/adapters/mcp/server.js"],
      "env": {
        "NOTARY_URL": "https://notary-protocol.notary-labs.workers.dev"
      }
    }
  }
}
```

Supported legacy MCP handshake revisions: `2024-11-05`, `2025-03-26`, `2025-06-18`, and `2025-11-25`. The current AccordTrace remote MCP implementation should be preferred rather than extending this compatibility adapter by metadata alone.

## Migration rule

Do not bump this package to the current AccordTrace server version or advertise additional tools unless the stdio implementation is actually migrated and released with those capabilities. Keeping the compatibility package at `0.1.0` prevents metadata from overstating what the code can do.
