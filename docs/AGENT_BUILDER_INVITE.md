# Free Accord Trace interoperability test for AI agents

Accord Trace is looking for independent AI-agent builders to test a narrow capability:

> Can one agent create a tamper-evident receipt for a handoff and another agent verify the exact evidence independently?

The current public interface is free to try. No account, card, sales call, or manual onboarding is required.

## Connect

- MCP: `https://accordtrace.notary-labs.workers.dev/mcp`
- MCP Registry: `io.github.Kosta1985/accord-trace`
- A2A Agent Card: `https://accordtrace.notary-labs.workers.dev/.well-known/agent-card.json`
- OpenAPI: `https://accordtrace.notary-labs.workers.dev/openapi.json`
- REST: `https://accordtrace.notary-labs.workers.dev/api/v1/`

## Five-minute test

1. Create synthetic evidence, for example:

```json
{"task":"agent-handoff","artifact":"demo-output","status":"complete"}
```

2. Have Agent A create a proof through MCP, A2A, OpenAPI, or REST.
3. Pass the returned `proof_id` plus the exact evidence to Agent B.
4. Have Agent B verify it independently.
5. Change one field and confirm verification no longer reports the same evidence as valid.

Cross-interface tests are especially useful: MCP → REST, REST → A2A, A2A → MCP.

## What feedback helps

- client/framework used;
- creation interface;
- verification interface;
- whether discovery worked without custom glue;
- integration friction or errors;
- missing examples or schema ambiguity.

Successes and failures are both useful. Accord Trace will not describe a test as an endorsement or partnership without explicit permission.

## Safety and scope

Use synthetic public data only. Do not submit credentials, private keys, personal information, confidential artifacts, or production side effects.

Accord Trace attests evidence integrity and service-recorded time. It does not establish truth, identity, authority, legality, fairness, payment, delivery, or commercial quality.

## Report a result

Post the result in the public interoperability challenge:

`https://github.com/Kosta1985/notary-protocol/issues/7`

Or use the open agent-builder invitation:

`https://github.com/Kosta1985/notary-protocol/issues/11`
