# MCP adapter

The adapter exposes `notary_verify` and `notary_get_receipt` over MCP stdio transport.

```json
{
  "mcpServers": {
    "notary": {
      "command": "node",
      "args": ["/path/to/notary-protocol/adapters/mcp/server.js"],
      "env": { "NOTARY_URL": "http://127.0.0.1:8787" }
    }
  }
}
```
