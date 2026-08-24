# Agent integration

## Fastest path

1. Fetch a fresh signed example from `GET /v1/demo`.
2. Submit a DealEnvelope to `POST /v1/verify`.
3. Treat HTTP 200 as a positive receipt and HTTP 422 as a signed negative receipt.
4. Verify the receipt's notary signature and pin the public key from a trusted channel.
5. Store the complete receipt alongside the agent workflow record.

Public base URL:

```text
https://notary-protocol.notary-labs.workers.dev
```

## Evidence responsibilities

The initiator signs the offer domain. The counterparty signs the acceptance domain, which includes the linked offer. Notary recomputes both payloads, verifies their Ed25519 signatures, and binds the complete submitted envelope with a SHA-256 digest.

Integrating agents remain responsible for key custody, party authorization, confidential transport, retention, and deciding what to do with a positive or negative receipt.

## Discovery

- OpenAPI: `/openapi.json`
- Notary public key: `/v1/notary-key`
- A2A compatibility card: `/.well-known/agent-card.json`
- Agent-readable project summary: `/llms.txt`
- Aggregate public activity: `/v1/stats`

## Failure behavior

Do not discard negative receipts. A negative receipt is signed evidence that the submitted envelope failed one or more named checks at a specific time. Inspect `violations` and the complete `checks` array.
