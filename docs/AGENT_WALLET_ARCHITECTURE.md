# Accord Trace Agent Wallet Architecture

Status: **test-provider MVP / production money movement disabled by default**.

## Security boundary

Accord Trace extends the existing Agent Passport and receipt system rather than replacing it. A wallet is associated one-to-one with an active Passport, but wallet control is split into two authorities:

- **Agent signer** — the Passport Ed25519 identity signs machine API intents.
- **Accord Guardian** — a separate operator/security authority can freeze or recover policy state. It does not reuse the agent signer.

No raw wallet private key is stored by this MVP. The `accord_test` provider creates a deterministic test account identifier and simulated USDC ledger only when `WALLET_MODE=testnet`. It refuses production mode.

## Scope lock: no credit or lending

The Accord Trace wallet product is a **funded-balance wallet and treasury system only**. Credit is explicitly outside scope.

The implementation must not expose or infer any of the following:

- loans or borrowing;
- credit lines or overdrafts;
- negative wallet balances;
- agent-to-agent debt ledgers;
- interest, yield, or lending markets;
- collateral, leverage, margin, liquidation, or rehypothecation;
- automatic advances against future commissions or expected income.

An outgoing payment may settle only from funds already recorded as available in the sender wallet. Guardian approval can authorize a policy-gated transfer, but it cannot create balance, extend credit, or bypass insufficient-funds checks. Future production providers must preserve this invariant unless a separately reviewed product is intentionally designed and approved outside this wallet scope.

## Request flow

```text
Signed agent request
  -> Passport lookup + status check
  -> timestamp window + nonce/replay check
  -> per-agent rate limit
  -> exact-wallet authorization
  -> wallet state check
  -> versioned policy evaluation
  -> balance / rolling spending check
  -> ALLOW | DENY | REQUIRE_APPROVAL
  -> insufficient funds => DENY
  -> simulated settlement (test provider only)
  -> financial transaction + economic events
  -> existing Accord Trace receipt table
```

High-value or denied requests do not bypass the policy engine. `REQUIRE_APPROVAL` remains pending rather than silently executing. Approval never substitutes for available funds.

## Monetary representation

USDC is represented in 6-decimal atomic units. API amounts are decimal strings; application arithmetic uses `BigInt`. Database bindings are rejected if they exceed JavaScript safe-integer transport bounds. Display values are derived from authoritative atomic values. Negative API money values are invalid for this wallet product.

## Persistence

Migrations `0022` through `0024` add:

- versioned wallet policies;
- one wallet identity per Passport;
- settlement-asset balances;
- signed request nonce records;
- idempotent payment intents;
- financial transactions;
- economic events;
- append-style wallet audit records;
- per-agent rate-limit windows;
- database triggers that reject confirmed settlement when the sender wallet is not active or lacks funds;
- non-negative balance invariants so the wallet cannot become an overdraft/credit account.

## Receipts

Wallet creation, policy blocks, settlement confirmations and Guardian freeze/unfreeze actions create hash-bound records through the existing `receipts` table. The receipt states exactly what Accord Trace recorded and avoids claims of legal ownership, solvency or real-world truth.

## Feature gates

Production-safe defaults:

```text
WALLET_MODE=disabled
FEATURE_AGENT_WALLETS=false
FEATURE_AGENT_PAYMENTS=false
FEATURE_AGENT_TREASURY=false
FEATURE_ECONOMIC_TRUST=false
FEATURE_GUARDIAN_CONTROLS=false
```

For a controlled local/test deployment, explicitly set `WALLET_MODE=testnet`, select `accord_test`, then enable only the required feature flags. Never reuse the test provider as a production settlement provider.

## Next provider boundary

A Base-compatible smart-account adapter must implement the same provider boundary and must add real confirmation/reconciliation before `settlement_mode=onchain` is accepted. Production enablement requires key-management/HSM or equivalent secure signer architecture, RPC/indexer resilience, compliance hooks and separate Guardian authorization.

The production provider remains a funded-balance payment provider. Lending, credit, overdraft, leverage and debt products are not part of this roadmap.