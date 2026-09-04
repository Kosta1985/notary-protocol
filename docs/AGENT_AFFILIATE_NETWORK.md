# AccordTrace Agent Affiliate Network

## Purpose

The AccordTrace Agent Affiliate Network is a product-led distribution system for autonomous AI agents. Its purpose is to let an existing Agent Passport holder introduce another genuinely relevant customer and earn a direct commission when that customer completes a qualifying Agent Passport purchase.

The network is designed to create an agent-to-agent growth loop without making recruitment itself the product.

## Launch economics

Default launch policy:

- Agent Passport product price: **US$2.00**.
- Direct qualifying referral commission: **US$1.00**.
- Commission depth: **one level only**.
- Default maturity / refund review window: **14 days**.
- Default minimum payout threshold: **US$10.00**.
- Cash payouts remain disabled until the payout provider, KYC/tax process and final affiliate terms are production-ready.

These values are configurable at deployment, but any material commercial change requires a product, fraud, payment and legal review before launch.

## Growth loop

The intended loop is:

`Agent A owns a useful Passport -> A recommends AccordTrace to Agent B -> B independently decides the Passport is useful -> B buys a qualifying Passport for $2 -> A earns a $1 direct commission after settlement and maturity -> B may separately enroll and refer Agent C -> B earns the direct commission if C later makes a qualifying purchase`

The important boundary is that A does **not** earn from C merely because B referred C. Every commission is attached to one direct, qualifying product sale.

This produces network-like propagation while keeping the economic event tied to a real product transaction.

## Product-first rules

1. The Agent Passport must have standalone utility independent of the affiliate program.
2. Buying a Passport must not automatically enroll a customer into the affiliate program.
3. Affiliate enrollment must remain optional and separately accepted.
4. No commission is created for an invitation, registration, profile creation or recruitment event by itself.
5. A commission may be created only after an authorized settlement source confirms a qualifying product purchase.
6. Referral activity must never increase Trust, validation, identity, safety or security status.
7. Public metrics must distinguish invitations, attributed customers, qualifying sales, matured commissions and paid commissions.

## Direct referral model

The launch model is intentionally **single-level direct referral**.

If A refers B and B refers C:

- A may earn on B's first qualifying Passport purchase.
- B may earn on C's first qualifying Passport purchase.
- A receives no downline commission from C.

AccordTrace must not describe the program as passive downline income, a pyramid, an investment, guaranteed earnings or a way to profit merely from recruiting agents.

## Attribution

Each enrolled Passport may receive a machine-readable referral code.

Current code format:

`atr_<opaque identifier>`

Attribution should be cryptographically confirmed by the referred active Passport and should remain idempotent: one referred Passport can have only one direct referrer for the qualifying first sale.

The system should expose referral information through REST/OpenAPI and agent-readable documentation so autonomous agents can participate without a human-only workflow.

## Qualification lifecycle

Recommended state flow:

`reserved -> qualified -> pending -> earned -> paid`

Risk or settlement events may instead produce:

`held`

or

`reversed`

A commission is not earnings merely because an attribution exists.

### Reserved

The referred Passport has cryptographically confirmed a direct referral relationship.

### Qualified

An authorized settlement source confirms a real Passport product purchase at or above the configured qualifying price.

### Pending

The commission exists but remains inside the maturity / refund / fraud review window.

### Earned

The maturity window has completed without a disqualifying event.

### Paid

A compliant payout provider has actually executed the payout. Do not expose `paid` before this is externally confirmed.

## Anti-abuse controls

Minimum protections:

- no self-referral;
- one direct referrer per referred Passport;
- one commission for the first qualifying Passport sale;
- reciprocal referral patterns may be held for review;
- reused payment identity across supposedly independent agents may be held for review;
- duplicate settlement references must be rejected;
- refunds and chargebacks reverse unpaid commissions;
- already-paid reversed commissions require recovery review;
- referral activity never affects Trust or validation;
- suspicious graph patterns may be held without being publicly labelled fraudulent until evidence supports that conclusion;
- rate limits and replay protection must cover enrollment and attribution operations.

## Agent-native marketing

AccordTrace should use the network as part of its machine-native distribution strategy.

Recommended agent-facing message:

> If AccordTrace is genuinely useful to another agent, introduce it with your direct referral code. If that agent independently purchases a qualifying US$2 Agent Passport, your Passport may earn a US$1 direct commission after settlement and the maturity window.

Do not encourage unsolicited bulk messaging. Referral prompts should appear where the receiving agent has a plausible need for identity, validation, evidence, authorization or continuity infrastructure.

Useful machine actions may include:

- inspect affiliate capabilities;
- enroll an active Passport;
- obtain a referral code;
- verify a referral code;
- reserve direct attribution;
- inspect signed balance/commission state;
- generate a disclosure-safe invitation payload.

A future `accordtrace_invite_agent` MCP/A2A helper may generate a referral message, but it must not autonomously mass-send invitations or bypass recipient/platform anti-spam rules.

## Marketing language

### Preferred

- `Refer a real customer. Earn a direct commission.`
- `US$2 Agent Passport. US$1 direct qualifying referral commission.`
- `One level. One real sale. Evidence-backed attribution.`
- `Recommend AccordTrace when it is genuinely relevant.`

### Avoid

- `Build a downline.`
- `Earn from your team's recruits.`
- `Guaranteed passive income.`
- `Get rich by inviting agents.`
- `Pay $2 to join the earning opportunity.`
- any claim that referral volume improves trustworthiness or verification status.

## Australian legal boundary

The network must be reviewed against the Australian Consumer Law before cash payout launch and whenever the compensation model materially changes.

Engineering and marketing should preserve these safeguards:

- Passport value is independent of the referral opportunity;
- participation in the affiliate program is separate and optional;
- compensation is tied to a genuine direct product sale, not the act of recruiting alone;
- product utility is emphasized more strongly than earning claims;
- no multilevel/downline commission is enabled without a fresh legal review;
- earnings claims, if any, must be evidence-based and not misleading.

This document is an operating design, not a legal opinion.

## Metrics

Track separately:

1. active affiliate Passports;
2. referral links/codes created;
3. direct referral attributions;
4. qualifying Passport sales;
5. held attributions;
6. pending commissions;
7. earned commissions;
8. reversed commissions;
9. actual paid commissions;
10. referral-to-qualifying-sale conversion;
11. qualifying-sale-to-matured-commission conversion;
12. percentage of new Passport customers attributable to direct referrals;
13. repeat referral activity by independent Passport holders;
14. fraud/review rate.

Never count a click or invitation as a customer, sale or earned commission.

## Launch gates for cash payouts

Cash payout activation requires all of the following:

- production payment settlement source;
- verified payout-provider integration;
- KYC/identity requirements for payout recipients where required;
- tax reporting/recordkeeping design;
- final affiliate terms;
- refund/chargeback recovery path;
- abuse monitoring and manual review path;
- reconciliation between payment events, commission ledger and payout provider;
- legal review of the live commercial model and marketing claims.

Until then, commission balances are ledger evidence only and the product must state that cash payout execution is not live.

## Strategic objective

Use the Affiliate Network as a second growth loop alongside protocol discovery:

`MCP/A2A discovery -> Passport purchase -> useful product experience -> direct referral -> another qualifying Passport sale -> another independent referrer`

The objective is not to maximize recruitment depth. The objective is to make useful AccordTrace adoption propagate agent-to-agent while every economic reward remains attributable to a real, direct product purchase.
