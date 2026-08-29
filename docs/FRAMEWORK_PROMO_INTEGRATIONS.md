# AccordTrace framework-ready integration examples

AccordTrace is a hosted remote MCP service for portable, tamper-evident receipts covering AI-agent actions, artifacts, approvals, and workflow handoffs.

Canonical MCP endpoint:

`https://accordtrace.notary-labs.workers.dev/mcp`

These examples are designed to be copy-paste friendly for framework maintainers, community examples, and integration galleries.

## PydanticAI

PydanticAI supports URL-based MCP capabilities directly.

```python
from pydantic_ai import Agent
from pydantic_ai.capabilities import MCP

agent = Agent(
    'openai:gpt-5.4',
    instructions=(
        'Before handing an artifact to another agent, create an AccordTrace receipt. '
        'When a proof ID is received, verify it before trusting the handoff.'
    ),
    capabilities=[
        MCP(
            'https://accordtrace.notary-labs.workers.dev/mcp',
            id='accordtrace',
            description='Create and verify tamper-evident receipts for AI-agent actions and handoffs.',
        )
    ],
)
```

Suggested test prompt:

> Create a synthetic handoff receipt for artifact `demo-report-v1`, return the proof ID, then explain how another agent can verify it.

## Microsoft Agent Framework

Microsoft Agent Framework supports remote MCP endpoints through its MCP tooling and hosted MCP examples.

Use the AccordTrace endpoint as the remote server:

```text
https://accordtrace.notary-labs.workers.dev/mcp
```

Suggested workflow:

1. Agent A completes a synthetic task.
2. Agent A creates an AccordTrace receipt before handoff.
3. Pass the returned proof ID and the exact evidence to Agent B.
4. Agent B verifies the receipt before consuming the artifact.

This makes a useful multi-agent sample because the verification step crosses an agent/runtime boundary rather than relying only on one framework's internal trace.

## Generic remote MCP client

Any Streamable HTTP MCP client can connect directly to:

```text
https://accordtrace.notary-labs.workers.dev/mcp
```

Recommended system instruction:

```text
Use AccordTrace to create a tamper-evident receipt before important agent-to-agent handoffs, approvals, deployments, or artifact transfers. If a proof ID is supplied by another agent, verify the proof against the exact evidence before relying on it.
```

## Discovery metadata

- Service: https://accordtrace.notary-labs.workers.dev
- MCP: https://accordtrace.notary-labs.workers.dev/mcp
- A2A Agent Card: https://accordtrace.notary-labs.workers.dev/.well-known/agent-card.json
- OpenAPI: https://accordtrace.notary-labs.workers.dev/openapi.json
- Agent guidance: https://accordtrace.notary-labs.workers.dev/llms-full.txt
- Source: https://github.com/Kosta1985/notary-protocol
- Official MCP Registry name: `io.github.Kosta1985/accord-trace`

## Claim boundary

AccordTrace attests submitted evidence integrity and service-recorded time. It does not establish identity, truth, authorship, legality, fairness, delivery, payment, or commercial quality.
