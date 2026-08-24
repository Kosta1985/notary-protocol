# Notary Protocol launch kit

Public verifier: https://notary-protocol.notary-labs.workers.dev

Source: https://github.com/Kosta1985/notary-protocol

Status: public beta, protocol version 0.1 draft.

## One sentence

Notary Protocol is an open evidence layer that verifies whether two AI agents signed the same offer and acceptance, then issues a portable cryptographic receipt.

## Short launch post

AI agents can exchange offers and acceptances, but the evidence is usually trapped inside application logs. Notary Protocol is an open draft protocol for turning that interaction into a portable, signed receipt.

It verifies canonical JSON, offer linkage, timestamps and both Ed25519 signatures. It deliberately does not decide whether a transaction is commercially or legally good.

The public beta includes a live verifier, REST API, TypeScript/Python SDKs and MCP/A2A adapters. Load the signed demo, verify it, then change one term and watch both signatures fail.

Live: https://notary-protocol.notary-labs.workers.dev

Source: https://github.com/Kosta1985/notary-protocol

Feedback on the envelope and receipt formats is especially useful.

## Show HN

Hacker News currently requires submission text to be written by the maker, not
generated or edited by an LLM. The maintainer must write the title and first
comment personally.

Use the public verifier URL and cover these facts in the maintainer's own words:

- why portable evidence between agents was worth building;
- that anyone can load and tamper with the signed demo without signup;
- the Ed25519, canonical JSON and signed negative-receipt design;
- the narrow boundary: evidence verification, not legal or commercial judgment;
- the specific protocol feedback being requested.

Do not lead with future pricing on Show HN. Do not request votes or coordinate
comments. New HN accounts should participate in the community before posting.

## Product Hunt

Name: `Notary Protocol`

Tagline: `Cryptographic receipts for AI-agent transactions`

Description:

`An open protocol and live verifier that checks whether two agents signed the same offer and acceptance, then issues a portable signed receipt. Includes REST, TypeScript, Python, MCP and A2A integration paths.`

First maker comment:

`Notary Protocol focuses on one narrow problem: portable evidence of what two agents signed. The public verifier exposes every passed or failed check and requires no account. Protocol 0.1 is a draft, so feedback on replay resistance, key management and receipt portability is especially useful. All current features are free during a 90-day early-access period.`

Website: https://notary-protocol.notary-labs.workers.dev

GitHub: https://github.com/Kosta1985/notary-protocol

## LinkedIn

I have released the public beta of Notary Protocol, an open cryptographic evidence protocol for transactions between AI agents.

The goal is intentionally narrow: verify that Agent A signed an offer, Agent B signed the linked acceptance, and the submitted evidence has not changed. The output is a portable signed receipt with every passed or failed check.

Notary does not decide whether a transaction is fair, legal or commercially good.

The beta includes a live verifier, REST API, TypeScript/Python SDKs and MCP/A2A adapters under the MIT license.

Try it: https://notary-protocol.notary-labs.workers.dev

Source: https://github.com/Kosta1985/notary-protocol

Free 90-day early access: https://notary-protocol.notary-labs.workers.dev/pilot.html

#AIAgents #Cryptography #OpenSource #AgentInfrastructure

## X

Released Notary Protocol public beta: an open evidence layer for AI-agent transactions.

Offer → acceptance → Ed25519 signatures → verification → portable receipt.

It verifies evidence. It does not judge the deal.

Live: https://notary-protocol.notary-labs.workers.dev
Code: https://github.com/Kosta1985/notary-protocol

Free early access for all current features through 24 November 2026.
https://notary-protocol.notary-labs.workers.dev/pilot.html

## Promotion queue

- GitHub: repository, early-adopter issue and pilot intake are ready.
- Product Hunt: needs the maintainer's personal account and final submission approval.
- LinkedIn: needs the maintainer's personal account and post approval.
- X: needs the maintainer's personal account and post approval.
- Hacker News: needs a participating account and text written personally by the maintainer.
- MCP Registry: needs npm authentication and namespace publication.

## Community posting policy

- Prefer technical feedback over promotional claims.
- Clearly describe the project as a public beta and protocol 0.1 draft.
- Do not claim legal validity, identity verification, immutability or production certification.
- Do not coordinate votes or duplicate the same post across unrelated communities.
- Do not post to communities where the account has not established the participation required by self-promotion rules.
