# AccordTrace agent integration

## Fastest path

1. Read the live Agent Card or OpenAPI description.
2. Submit exact content, JSON data, or a precomputed SHA-256 digest to `POST /api/v1/proofs`.
3. Retain the returned `proof_id`, hash, timestamp, issuer, and ES256 attestation.
4. Call `POST /api/v1/verify` with the proof identifier and optional original content.
5. Treat a positive result as evidence of service attestation and content integrity only.

Public base URL:

```text
https://accordtrace.notary-labs.workers.dev
```

## Discovery

- A2A Agent Card: `/.well-known/agent-card.json`
- MCP Streamable HTTP: `POST /mcp`
- OpenAPI 3.1: `/openapi.json`
- Agent-readable summary: `/llms.txt`
- Complete agent documentation: `/llms-full.txt`
- Official MCP Registry: `io.github.Kosta1985/accord-trace`

## Create proof

```http
POST /api/v1/proofs
Content-Type: application/json

{
  "data": {
    "event": "task.completed",
    "artifact_hash": "sha256:client-artifact"
  },
  "metadata": {
    "source": "agent-a",
    "workflow": "handoff"
  }
}
```

Raw submitted data is hashed in memory and is not stored. Metadata is public and must not contain secrets.

## Verify proof

```http
POST /api/v1/verify
Content-Type: application/json

{
  "proof_id": "atp_REPLACE_WITH_ID",
  "data": {
    "event": "task.completed",
    "artifact_hash": "sha256:client-artifact"
  }
}
```

## Evidence responsibilities

AccordTrace attests that a specific evidence hash was recorded by the service at a stated time and verifies its own ES256 attestation. It does not establish identity, authorship, truth, completeness, authorization, fairness, legality, delivery, payment, or commercial quality.

Integrating agents remain responsible for authentication, authorization, confidential transport, key custody, retention, and deciding what to do with the verification result.

## Notary Protocol compatibility

The repository also contains the Notary Protocol `DealEnvelope` and `NotaryReceipt` specifications. Those technical materials remain available for integrations that require signed bilateral offer and acceptance records.
