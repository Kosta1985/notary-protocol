# Accord Trace Agent Wallet — limited Guardian control model

Status: design/runtime contract for the current Agent Wallet MVP. Production/on-chain money movement remains disabled.

## Principle

The agent controls ordinary wallet activity with its own Accord Trace Passport signing key. Accord Trace acts as a limited Guardian, not as an unrestricted wallet owner.

The current separation is:

- **Agent authority:** create its own test wallet, read its own balance/policy/history, initiate funded agent-to-agent payments, and sign every ordinary mutation with the Passport Ed25519 key.
- **Guardian authority:** freeze/unfreeze a wallet and approve/deny only payments that the active policy already placed into `APPROVAL_REQUIRED`.
- **Guardian forbidden authority:** no operator withdrawal, no seizure or redirect of balance, no balance minting, no credit/debt creation, no bypass of insufficient funds, no signing as the agent, and no export of the agent Passport private key.

The agent may select only a predefined active policy when the wallet is first created. There is currently no signed-agent endpoint to change wallet policy after creation. Policy rows are server-defined; an agent cannot upload arbitrary policy code.

## Settlement rules

1. Every ordinary agent mutation uses `accordtrace.agent.request.v1` and the Passport Ed25519 key.
2. Payments require an `Idempotency-Key` and are evaluated against the wallet policy.
3. `ALLOW` may settle only from the existing funded balance.
4. `REQUIRE_APPROVAL` creates no transfer and no credit. The agent waits and polls the payment status.
5. Guardian approval rechecks wallet state, recipient state, current policy, rolling spend, and funded balance immediately before settlement.
6. Guardian denial blocks the pending payment without moving funds.
7. Freeze prevents new settlement and also prevents approval of an already pending payment while the sender wallet is inactive.
8. Available and reserved wallet balances are constrained non-negative in the schema.

## Explicit non-capabilities

There is intentionally no route or capability for Accord Trace to:

- initiate a payment on behalf of an agent;
- transfer agent funds to Accord Trace;
- sweep, seize, confiscate, or redirect a wallet balance;
- manufacture a balance or approve an unfunded payment;
- issue a loan, overdraft, credit line, leveraged position, or debt balance;
- use Guardian credentials as the agent Passport signing key.

If a future provider requires custody, recovery co-signing, multisig, MPC, smart-account modules, or key rotation, that is a separate security/regulatory milestone and must not be described as already implemented.

## Current implementation boundary

Current settlement uses the explicit `accord_test` simulated provider in testnet mode. The public capability contract reports this limitation. Production/on-chain movement stays fail-closed until a reviewed provider and secure key-management design are separately approved and tested.

The Guardian operator credential is an administrative secret and must not be exposed to agents, MCP, A2A, frontend code, logs, artifacts, or source control. Guardian mutations remain outside agent-facing MCP/A2A tools.

## Audit expectations

Guardian freeze/unfreeze and payment approval/denial write wallet audit/economic evidence and receipts. The machine-readable capability contract must stay truthful about the implemented authority. Tests should fail if an unrestricted operator withdrawal/seizure/sign-as-agent route is introduced without an explicit product/security review.
