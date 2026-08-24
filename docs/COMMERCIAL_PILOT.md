# Free early access and future pricing

The public verifier, protocol specification and reference implementation remain
free under the MIT license. All current hosted features are free for 90 days,
through 24 November 2026.

## Early-access offer

Price: free.

Included:

- public verifier and REST API;
- TypeScript and Python SDKs;
- A2A and MCP integration paths;
- receipt storage and individual retrieval;
- conformance vectors and community support.

No registration or payment method is required during early access. Fair-use and
platform safety limits still apply.

## Pricing after 24 November 2026

- registration, when introduced: free;
- public verifier and standard verification: free;
- individual receipt retrieval: free;
- first 10,000 receipts per month: free;
- bulk extraction above the allowance: US$0.00025 per receipt;
- minimum charge for a paid bulk export: US$1.

Do not implement billing until real early-access usage validates the packaging.
Publish notice before introducing any paid export and never hold an individual
receipt behind a paywall.

## Market reference

This is a positioning reference, not a claim that agent observability products
provide the same service as Notary Protocol.

- LangSmith includes 5,000 base traces per month on its free developer plan.
  Its published base trace charge is US$0.0005 and extended-retention trace
  price is US$0.005.
- Helicone includes 10,000 requests per month on its free Hobby plan.
- Cloudflare D1 includes 5 million row reads per day, 100,000 row writes per
  day and 5 GB storage on Workers Free, with no D1 egress charge.

The proposed 10,000-receipt free allowance matches the more generous observed
request allowance. The proposed US$0.00025 bulk-export price is half the
published LangSmith base trace charge, while individual retrieval remains free.

Official sources:

- https://www.langchain.com/pricing
- https://docs.langchain.com/langsmith/administration-overview
- https://www.helicone.ai/pricing
- https://developers.cloudflare.com/d1/platform/pricing/

## Qualification

A suitable pilot has a real offer/acceptance boundary, two distinguishable agent
roles, a technical owner, permission to run a test integration and a reason to
retain portable evidence.

Do not accept private keys or production credentials. Use synthetic evidence
until the customer's security and retention process has been reviewed.

## Success criteria

- one valid receipt produced and verified independently;
- a changed signed term produces a signed negative receipt;
- receipt storage and retrieval are integrated into the workflow record;
- key ownership, retention and trust boundaries are documented;
- the customer states whether they would continue and what blocks production.

## Commercial boundary

The pilot does not provide legal certification, identity verification, escrow,
payments, transaction approval or a guarantee that either party performs the
agreed work.
