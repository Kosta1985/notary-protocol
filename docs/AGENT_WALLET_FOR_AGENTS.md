# Accord Trace Wallet — machine guide for agents

Status: **test-provider MVP. Production money movement is disabled by default.**

This interface is designed for autonomous software agents, not for a human clicking through a banking UI. Every money-moving request is tied to the agent's existing Accord Trace Passport Ed25519 key, a fresh nonce, the exact HTTP method/path/query, and the SHA-256 hash of the raw request body.

## 1. Discover before acting

An agent should read the live capability contract before attempting wallet operations:

```http
GET /api/v1/agent/wallet-capabilities
```

The same read-only contract is discoverable through:

- MCP tool: `accord_trace_wallet_capabilities`
- A2A skill/action: `wallet_capabilities`

Check `wallet_enabled` and `payments_enabled`. A disabled response is authoritative. Do not retry money-moving calls just because a feature is advertised in documentation.

## 2. Financial scope: funded balances only

Accord Trace Wallet does **not** provide credit or lending.

There are no loans, credit lines, overdrafts, negative balances, debt ledgers, interest, lending yield, collateral, leverage, margin, or liquidation flows. An outgoing payment can settle only from funds already available in the sender wallet. Guardian approval never creates funds and never overrides insufficient balance.

`economicTrustLevel` is operational history. It is not a credit score, lending decision, identity guarantee, or proof of solvency.

## 3. Agent signing contract

Required headers on signed REST calls:

```text
X-Accord-Passport-Id
X-Accord-Timestamp
X-Accord-Nonce
X-Accord-Signature
```

The signature is Ed25519 over canonical JSON with this shape:

```json
{
  "domain": "accordtrace.agent.request.v1",
  "passport_id": "ACCORD-AGENT-ALPHA",
  "timestamp": "2026-09-05T12:00:00.000Z",
  "nonce": "req_unique_nonce",
  "method": "POST",
  "path": "/api/v1/agent/payments",
  "query": "",
  "body_hash": "<lowercase sha256 hex of exact raw body>"
}
```

Object keys are canonicalized in sorted order before signing. The server accepts a five-minute clock window and stores used nonces to reject replay.

Use `examples/agent-wallet/signed-client.mjs` instead of reimplementing the signing contract unless your runtime cannot use Web Crypto.

## 4. Recommended autonomous sequence

1. Read wallet capabilities.
2. Confirm the Passport is active and the agent owns its signer.
3. Create or fetch the agent's own wallet.
4. Read the current wallet policy before spending.
5. Read the authoritative funded balance.
6. For a payment, generate a new request nonce and a stable `Idempotency-Key` for that economic intent.
7. Submit the signed payment request.
8. Treat `ALLOW`, `DENY`, `REQUIRE_APPROVAL`, and `QUARANTINE` as machine decisions, not prose suggestions.
9. Persist the returned Accord Trace financial receipt ID with the task/handoff that caused the payment.
10. Reconcile through transaction and receipt endpoints rather than assuming network success from a client-side timeout.

## 5. Core routes

```text
GET  /api/v1/agent/wallet-capabilities   public read-only discovery
POST /api/v1/agent/wallet                create own wallet
GET  /api/v1/agent/wallet                read own wallet
GET  /api/v1/agent/wallet/balance        authoritative funded balance
GET  /api/v1/agent/wallet/policy         current policy
POST /api/v1/agent/payments              funded agent-to-agent payment
GET  /api/v1/agent/payments/:id          payment state for sender/recipient
GET  /api/v1/agent/transactions          transaction history
GET  /api/v1/agent/receipts              financial receipts
GET  /api/v1/agent/economic-trust        operational economic history band
```

Except for capability discovery, agent routes require the signed Passport request.

## 6. Idempotency and retry behavior

Every `POST /api/v1/agent/payments` call requires `Idempotency-Key`.

If the same sender reuses the same key with the same economic request, Accord Trace returns the existing payment state instead of transferring twice. Reusing that key for a different recipient, amount, asset, purpose, or task is a conflict.

A network timeout is therefore handled by retrying the **same economic intent with the same Idempotency-Key but a fresh signed request nonce**.

Never reuse the same nonce. Nonces protect request replay; idempotency keys protect economic duplication. They solve different problems.

## 7. Policy behavior agents should understand

The current policy engine can return:

- `ALLOW` — the request can proceed from existing funds.
- `DENY` — do not retry unchanged; inspect the policy code.
- `REQUIRE_APPROVAL` — no money has moved. Wait for Guardian/operator resolution.
- `QUARANTINE` — treat the wallet/security state as unsafe for autonomous settlement.

Important codes include:

```text
TRANSACTION_LIMIT_EXCEEDED
DAILY_LIMIT_EXCEEDED
GUARDIAN_APPROVAL_REQUIRED
INSUFFICIENT_BALANCE
WALLET_NOT_ACTIVE
RECIPIENT_NOT_ALLOWED
REQUEST_REPLAY_DETECTED
IDEMPOTENCY_KEY_CONFLICT
RATE_LIMITED
FEATURE_DISABLED
```

Agents should branch on machine codes, not English error text.

## 8. Guardian boundary

The agent signer and Guardian authority are deliberately separate.

Guardian controls may freeze autonomous activity and later unfreeze/recover policy state. Guardian actions create audit records and Accord Trace receipts. Guardian is not a lender, does not possess a hidden credit facility, and cannot make an underfunded payment valid.

## 9. Current settlement boundary

The only implemented provider in this milestone is `accord_test`, which creates separate deterministic-looking test account identities and a simulated USDC ledger. It refuses production mode.

A later Base-compatible provider must preserve the same agent-facing contract while adding secure signer/key-management infrastructure, chain confirmation and reconciliation, RPC/indexer resilience, compliance controls, and tested recovery procedures. It must not introduce credit unless the product scope is explicitly changed in a future reviewed design.
