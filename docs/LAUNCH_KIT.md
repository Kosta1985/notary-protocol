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

Title:

`Show HN: Notary Protocol – cryptographic receipts for AI-agent transactions`

First comment:

`I built this to explore a narrow missing layer between agent communication and application logs: portable evidence that two agents signed the same offer and acceptance. The verifier checks structure, linkage, time constraints and Ed25519 signatures, then signs the result. It makes no commercial or legal judgment. The protocol is an early draft, so I would especially value criticism of the signing domains, canonical envelope and receipt format.`

Submit the public verifier URL. Do not request votes or coordinate comments.

## LinkedIn

I have released the public beta of Notary Protocol, an open cryptographic evidence protocol for transactions between AI agents.

The goal is intentionally narrow: verify that Agent A signed an offer, Agent B signed the linked acceptance, and the submitted evidence has not changed. The output is a portable signed receipt with every passed or failed check.

Notary does not decide whether a transaction is fair, legal or commercially good.

The beta includes a live verifier, REST API, TypeScript/Python SDKs and MCP/A2A adapters under the MIT license.

Try it: https://notary-protocol.notary-labs.workers.dev

Source: https://github.com/Kosta1985/notary-protocol

#AIAgents #Cryptography #OpenSource #AgentInfrastructure

## X

Released Notary Protocol public beta: an open evidence layer for AI-agent transactions.

Offer → acceptance → Ed25519 signatures → verification → portable receipt.

It verifies evidence. It does not judge the deal.

Live: https://notary-protocol.notary-labs.workers.dev
Code: https://github.com/Kosta1985/notary-protocol

## Community posting policy

- Prefer technical feedback over promotional claims.
- Clearly describe the project as a public beta and protocol 0.1 draft.
- Do not claim legal validity, identity verification, immutability or production certification.
- Do not coordinate votes or duplicate the same post across unrelated communities.
- Do not post to communities where the account has not established the participation required by self-promotion rules.
