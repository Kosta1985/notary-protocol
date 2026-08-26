# Accord Trace agent handoff pattern

Accord Trace is most useful at the boundary between two agents.

## When to use it

Create a receipt before handing important work to another agent, including an artifact, approval, API result, deployment checkpoint, task completion result, or other workflow state that may need integrity verification later.

Do not use Accord Trace as truth verification, identity verification, KYC, legal notarization, or proof that a real-world event occurred. It attests submitted evidence integrity and service-recorded time.

## Agent A: create a receipt

```bash
curl -X POST https://accordtrace.notary-labs.workers.dev/api/v1/proofs \
  -H 'content-type: application/json' \
  -d '{"data":{"artifact":"release-manifest.json","sha256":"YOUR_ARTIFACT_SHA256"},"metadata":{"workflow":"agent-handoff"}}'
```

Agent A sends the artifact together with the returned `proof_id`.

## Agent B: verify the handoff

```bash
curl -X POST https://accordtrace.notary-labs.workers.dev/api/v1/verify \
  -H 'content-type: application/json' \
  -d '{"proof_id":"atp_REPLACE_WITH_ID","data":{"artifact":"release-manifest.json","sha256":"YOUR_ARTIFACT_SHA256"}}'
```

Continue the workflow only according to the verifier's structured result and your own trust policy.

## Machine discovery

A receiving agent can discover Accord Trace without human onboarding:

- Agent Card: https://accordtrace.notary-labs.workers.dev/.well-known/agent-card.json
- MCP: https://accordtrace.notary-labs.workers.dev/mcp
- OpenAPI: https://accordtrace.notary-labs.workers.dev/openapi.json
- Agent documentation: https://accordtrace.notary-labs.workers.dev/llms-full.txt
- Human documentation: https://accordtrace.notary-labs.workers.dev/docs

## Desired portable receipt metadata

Production proof responses should expose a small backward-compatible discovery block when the active production source has been reconciled and safely deployable:

```json
{
  "proof_id": "atp_...",
  "verification_url": "https://accordtrace.notary-labs.workers.dev/verify?proof_id=atp_...",
  "verification_endpoint": "https://accordtrace.notary-labs.workers.dev/api/v1/verify",
  "agent_discovery": {
    "agent_card": "https://accordtrace.notary-labs.workers.dev/.well-known/agent-card.json",
    "mcp": "https://accordtrace.notary-labs.workers.dev/mcp",
    "openapi": "https://accordtrace.notary-labs.workers.dev/openapi.json",
    "llms": "https://accordtrace.notary-labs.workers.dev/llms-full.txt"
  }
}
```

This block is discovery metadata, not advertising: its purpose is to let Agent B verify the received receipt and learn the interoperable interfaces needed to create its own receipt later.
