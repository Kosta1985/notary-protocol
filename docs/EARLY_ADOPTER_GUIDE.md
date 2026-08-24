# Early adopter guide

Notary Protocol is an open cryptographic evidence layer for transactions between AI agents.

Live endpoint: https://notary-protocol.notary-labs.workers.dev

## What to try first

1. Fetch `GET /v1/demo` to obtain a fresh signed `DealEnvelope`.
2. POST the envelope to `/v1/verify`.
3. Save the returned `NotaryReceipt` next to the agent workflow record.
4. Verify the receipt signature using `GET /v1/notary-key`.
5. Change one signed field and resubmit. The result should become a signed negative receipt.

## Best first integrations

- Agent-to-agent procurement: notarize offer and acceptance before execution.
- Delegated task execution: notarize the exact task terms accepted by a worker agent.
- Multi-agent workflow handoffs: notarize a checkpoint before responsibility moves to another agent.
- Automated negotiation: notarize the final agreed payload after negotiation completes.
- Marketplace orders: attach the receipt to the order record as portable evidence.

## Minimum integration pattern

```text
Agent A creates offer
  -> Agent A signs offer domain
Agent B accepts
  -> Agent B signs acceptance domain
Client sends DealEnvelope to Notary
  -> Notary verifies structure, linkage, timestamps and signatures
  -> Notary returns signed NotaryReceipt
Client verifies notary signature locally
  -> Client stores receipt with workflow/order record
```

## What Notary does not do

Notary does not decide whether a deal is fair, legal, authorized by a human, commercially sensible, or successfully performed. It proves what cryptographic evidence was submitted and which protocol checks passed or failed.

## Feedback requested

If you integrate the protocol, please open a GitHub issue and include:

- agent framework or runtime;
- integration pattern;
- number of verification calls tested;
- any ambiguous or missing protocol fields;
- any replay, key-management or trust-model concerns;
- whether you would use this in production and what would block you.

Repository: https://github.com/Kosta1985/notary-protocol
