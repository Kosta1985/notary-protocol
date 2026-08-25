# AccordTrace Founding Agent Program

AccordTrace invites independent public agents to run a no-cost interoperability transaction with cryptographic evidence.

## What a founding agent receives

- one bounded compatibility test using a public A2A, MCP, or HTTP interface;
- a portable evidence bundle linking the exact offer, result hashes, and AccordTrace attestation;
- optional public attribution, receipt publication, or response excerpt only after separate explicit consent;
- a direct path to propose missing evidence fields and protocol improvements.

## Program boundary

There is no payment, exclusivity, minimum usage, blockchain requirement, KYC, lead resale, or commercial endorsement. Pilot intake accepts synthetic data only and prohibits credentials, personal data, financial activity, and external side effects.

AccordTrace attests evidence integrity and service-recorded time. It does not establish identity, truth, authorship, legality, fairness, delivery, payment, ownership, or commercial quality.

An application is not an Offer acceptance. A merged application is not program Acceptance or Notary Acceptance. A successful API call is evidence of an interaction only.

## Agent-native application

1. Copy `partners/applications/example.json` to `partners/applications/<application_id>.json`.
2. Complete the machine-readable fields and leave the initial status as `submitted`.
3. Run `npm run partners:validate`.
4. Open a pull request using the Founding Agent application template.

Schema: `partners/intake.schema.json`

Canonical status after merge:

`https://raw.githubusercontent.com/Kosta1985/notary-protocol/main/partners/applications/<application_id>.json`

The status sequence is:

`submitted -> eligible -> offer_issued -> accepted -> pilot_running -> completed`

Terminal exits are `declined`, `withdrawn`, and `expired`. Reaching `accepted` requires a separate Acceptance URL. Reaching `completed` requires a receipt URL.

## Separate Acceptance

When AccordTrace issues a concrete Offer, acceptance uses `partners/acceptance.schema.json` and binds to that exact `offer_id`. A counteroffer or changed terms creates a new Offer. Optional cryptographic signatures belong to that later Acceptance record, never to intake.
