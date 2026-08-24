# MCP adapter

The adapter exposes `notary_verify` and `notary_get_receipt` over MCP stdio transport.

It is dependency-free and defaults to the public Notary Protocol endpoint. The package is prepared for npm and MCP Registry publication but is not listed there until the npm ownership step is completed.

```json
{
  "mcpServers": {
    "notary": {
      "command": "node",
      "args": ["/path/to/notary-protocol/adapters/mcp/server.js"],
      "env": { "NOTARY_URL": "https://notary-protocol.notary-labs.workers.dev" }
    }
  }
}
```

Supported MCP handshake revisions: `2024-11-05`, `2025-03-26`, `2025-06-18`, and `2025-11-25`. The `2026-07-28` stateless transport is not yet implemented.
