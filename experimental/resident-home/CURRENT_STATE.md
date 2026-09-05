# Current state / audit record - 2026-09-06

## Repository verification

Confirmed through the connected GitHub repository metadata, README.md, AGENTS.md,
package.json, wrangler.jsonc and the deployment workflow:

- Repository: Kosta1985/notary-protocol; product: Accord Trace / AccordTrace.
- Upstream baseline main: d677b6c3110eca29a7cff2522bc76904719456bf.
- Exact baseline source tree: e4a30b1fcee2b97e5a9f28f37d5bff291a79b5e8.
- Worker entrypoint: cloudflare/src/worker-v2.js, wrapping the existing runtime.
- Existing stack: JavaScript ES modules, Cloudflare Workers, D1, static web assets,
  REST/MCP/A2A, Node tests. Existing cloudflare/migrations contains 25 migrations.
- Deployed target named by deploy-accordtrace.yml: accordtrace.
- Configured public base: https://accordtrace.notary-labs.workers.dev.
- The checked-in D1 ID is a placeholder; production binding resolution happens in
  the deployment workflow. No live database or secrets were read for this slice.
- Existing source price is explicitly USD 200 minor units for the Passport,
  and direct referral economics are USD 100 minor units in the existing README.
  This resolves the brief section 8.10 currency uncertainty at **source/config level**;
  it does not verify a live merchant account, completed payment or legal obligation.
- Existing PASSPORT_CHECKOUT_ENABLED is "false". No price, commercial gate, earned
  entitlement, wallet flag, referral code or signing key was changed.
- Wallet PR #107 is a separate unmerged draft; this branch is based on main,
  not on its diagnostic/concurrency changes. Nothing in that PR was merged here.

Git network access from the execution container was unavailable. The baseline was
reconstructed from an already mounted tracked-source archive, its five known branch
differences were removed using a connected GitHub compare plus exact Worker blob check,
and `git write-tree` matched the upstream main tree above. This is an exact-tree source
verification, not a claim that a container `git clone` succeeded.

## New local slice

Everything added is contained in experimental/resident-home. Existing production
files remain byte-identical. The schema is deliberately outside automatic migrations.
The local prototype is SQLite + encrypted filesystem objects, not an R2 deployment.
No additional dependency, npm package, domain, cloud resource or paid plan was created.

All new release flags are immutable false: resident_home, new_residency_billing,
hosted_compute, wallets, referrals, auto_migration, outgoing_webhooks. An explicit
`mode: local, enabled: true` constructor enables only the offline prototype. Its
presence is not a production feature flag or a commercial entitlement grant.

The actual seller, ABN/ACN, GST status, merchant-owner mapping, lawful operating terms,
incident owner, support address, production operator authentication and approved
new-infrastructure budget remain **UNVERIFIED / NOT APPROVED**. Kodi Construction is
not substituted as the seller. Approved new cloud spend remains zero.

## Evidence scope

Baseline: 384 tests passed locally before changes. New module test counts and final
full-suite results are captured in the delivery evidence archive and Russian report.
Local Node version tested: 22.16.0; its SQLite implementation emits an experimental
warning. This is not a Cloudflare, browser, Stripe, distributed-load or security-review
result. The existing public website was not changed or tested by this new slice.

## Economics and source checks

The calculator reproduces the user's section 8.8-8.9 management assumptions. AUD 9,
GST-inclusive 10%, refund reserve 3%, support time, infrastructure allowance, overhead,
CAC and churn are scenario inputs, not approved price/tax facts or measured costs.
Multiple seats per operator do not inflate independent customer counts.

Sources retrieved during this implementation session (2026-09-06 report date):
- R2: https://developers.cloudflare.com/r2/pricing/ . Standard tariffs, shared free
  allocation and account-level billing-unit rounding are modeled. Config effective
  date is a conservative model applicability date, not a claimed vendor change date.
  Thirty-day quote expiry is an internal modeling rule, not a provider guarantee.
- Stripe AU: https://stripe.com/au/pricing . The displayed international-card rate
  is 3.5% + AUD 0.30 and conversion has an additional charge. Future advertised
  reductions are not applied before their effective dates.
- Stripe Billing: https://stripe.com/au/billing/pricing . Pay-as-you-go is 0.7% of
  Billing volume; this is an assumption for the example, not an account contract.
- D1: https://developers.cloudflare.com/d1/worker-api/d1-database/ . Batch statements
  are transactions; this does not make a database transaction encompass R2 requests.
- D1 limits and R2 data-location pages were retrieved for further integration work.
  No per-shard capacity claim, Australian-only location or independent backup claim
  has been made or implemented.

R2 calculator output excludes Workers, D1, Queues, KMS, backup, CI and minimums outside
R2. The AUD 0.50 infrastructure allowance is unmeasured and must not be presented as a
full-cloud quote. USD/AUD 1.60 (stress 1.80) is a planning assumption, not a current FX rate.
