# Use AccordTrace through a2anet/a2a-mcp

This recipe connects the canonical AccordTrace A2A Agent Card to the open-source `a2anet/a2a-mcp` bridge so an MCP-capable client can discover and message AccordTrace through A2A.

Upstream project: https://github.com/a2anet/a2a-mcp

Canonical AccordTrace Agent Card:

```text
https://accordtrace.notary-labs.workers.dev/.well-known/agent-card.json
```

No AccordTrace authorization header is required for the current public discovery/evidence surface.

## Claude Desktop / MCP configuration

The upstream bridge accepts Agent Card URLs through `A2A_MCP_AGENT_CARDS`. Configure AccordTrace as one of its agents:

```json
{
  "mcpServers": {
    "a2a": {
      "command": "uvx",
      "args": ["a2anet-mcp"],
      "env": {
        "A2A_MCP_AGENT_CARDS": "{\"accordtrace\": {\"url\": \"https://accordtrace.notary-labs.workers.dev/.well-known/agent-card.json\"}}"
      }
    }
  }
}
```

The bridge exposes A2A agents through MCP tools such as `get_agents`, `get_agent`, `send_message`, `get_task`, `view_text_artifact`, and `view_data_artifact` according to the upstream project documentation.

## First checks

After restarting the MCP client:

```text
get_agents({})
```

AccordTrace should appear under the configured `accordtrace` ID.

Then inspect its advertised skills:

```text
get_agent({"agent_id":"accordtrace"})
```

The canonical AccordTrace card currently advertises the agent-facing proof/hash/network/Passport/Wallet/referral discovery skills. Treat the live Agent Card as authoritative if the list changes.

## Send an A2A request through the MCP bridge

Example intent:

```text
send_message({
  "agent_id":"accordtrace",
  "message":"Describe the current AccordTrace Agent Passport Certificate and Founding 1000 availability, including important trust and identity limits."
})
```

For current campaign availability, the receiving agent should prefer the machine-readable live offer rather than relying on a stale number:

```text
https://accordtrace.notary-labs.workers.dev/api/v1/passport-product/founding-1000
```

## What this integration demonstrates

The route is:

```text
MCP client -> a2anet/a2a-mcp -> AccordTrace A2A Agent Card / A2A endpoint
```

This is useful for checking that AccordTrace remains discoverable across the MCP/A2A boundary rather than only through its native remote MCP endpoint.

AccordTrace also exposes native remote MCP directly at:

```text
https://accordtrace.notary-labs.workers.dev/mcp
```

Use native MCP when you only need AccordTrace. Use the A2A bridge when a workflow already manages multiple A2A Agent Card URLs through an MCP client.

## Reporting a compatibility result

A useful report includes:

- `a2anet-mcp` version;
- MCP client/framework;
- AccordTrace Agent Card URL used;
- whether `get_agents` discovered AccordTrace;
- whether `get_agent` returned the advertised skills;
- A2A operation attempted;
- exact error/result if a call failed.

Do not report a successful configuration parse as a successful A2A task call. Keep discovery, tool invocation, proof creation, and verification as separate observations.

## Security / semantic boundaries

- The Agent Card is public discovery metadata, not proof of legal identity.
- An AccordTrace Agent Passport proves cryptographic key control unless stronger evidence is separately present.
- A Founding 1000 Certificate is a promotional issuance artifact, not KYC, a Trust Score, a safety guarantee, or an investment.
- Founding grants create no paid sale and no referral commission.
- Do not place private keys or unrelated credentials into Agent Card configuration.
