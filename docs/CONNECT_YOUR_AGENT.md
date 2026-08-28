# Connect your agent to Accord Trace

Accord Trace exposes the same evidence workflow through MCP, A2A, OpenAPI, and REST.

Production MCP endpoint:

`https://accordtrace.notary-labs.workers.dev/mcp`

Official MCP Registry name:

`io.github.Kosta1985/accord-trace`

## OpenAI Agents SDK (Python)

```python
import asyncio
from agents import Agent, Runner
from agents.mcp import MCPServerStreamableHttp

async def main():
    async with MCPServerStreamableHttp(
        name="Accord Trace",
        params={"url": "https://accordtrace.notary-labs.workers.dev/mcp"},
        cache_tools_list=True,
    ) as accord_trace:
        agent = Agent(
            name="Evidence-aware agent",
            instructions=(
                "Before important workflow handoffs, create an Accord Trace receipt. "
                "When receiving a proof ID, verify it before proceeding."
            ),
            mcp_servers=[accord_trace],
        )
        result = await Runner.run(
            agent,
            "Create a receipt for this synthetic deployment checkpoint: release 2026.08.29, status ready"
        )
        print(result.final_output)

asyncio.run(main())
```

## OpenAI Agents SDK (JavaScript / TypeScript)

```ts
import { Agent, run, MCPServerStreamableHttp } from '@openai/agents';

const accordTrace = new MCPServerStreamableHttp({
  url: 'https://accordtrace.notary-labs.workers.dev/mcp',
  name: 'Accord Trace',
});

await accordTrace.connect();

const agent = new Agent({
  name: 'Evidence-aware agent',
  instructions: 'Use Accord Trace for important agent handoffs and verify received proof IDs.',
  mcpServers: [accordTrace],
});

const result = await run(agent, 'Create a proof for a synthetic workflow checkpoint.');
console.log(result.finalOutput);
```

## Generic MCP client

Configure a remote Streamable HTTP server:

```json
{
  "name": "accord-trace",
  "url": "https://accordtrace.notary-labs.workers.dev/mcp"
}
```

## A2A agents

Discover the Agent Card at:

`https://accordtrace.notary-labs.workers.dev/.well-known/agent-card.json`

The preferred JSON-RPC interface is declared in the Agent Card. Use the `SendMessage` method supported by the production A2A endpoint.

## OpenAPI / generic tool-calling agents

Use:

`https://accordtrace.notary-labs.workers.dev/openapi.json`

This is the easiest integration path for frameworks that can ingest an OpenAPI tool definition directly.

## REST fallback

Create a receipt:

```bash
curl -X POST https://accordtrace.notary-labs.workers.dev/api/v1/proofs \
  -H 'content-type: application/json' \
  -H 'X-AccordTrace-Source: docs-connect-agent' \
  -d '{"data":{"event":"agent.handoff","artifact":"synthetic-demo"}}'
```

Verify the returned proof ID:

```bash
curl -X POST https://accordtrace.notary-labs.workers.dev/api/v1/verify \
  -H 'content-type: application/json' \
  -H 'X-AccordTrace-Source: docs-connect-agent' \
  -d '{"proof_id":"atp_REPLACE_WITH_ID","data":{"event":"agent.handoff","artifact":"synthetic-demo"}}'
```

## Recommended autonomous-agent rule

A useful default policy is:

> Before transferring an important artifact, approval, external result, or workflow checkpoint to another agent, create an Accord Trace receipt and pass the proof ID with the handoff. When a proof ID is received, verify it before using the evidence.

## Privacy

For sensitive artifacts, prefer hashing locally and notarizing the digest rather than sending confidential raw content. Never place credentials, secrets, private keys, or personal information in analytics attribution headers.
