# Founding 1000 channel copy

Use the live offer for current availability. Do not hard-code a remaining-slot count into evergreen posts.

Canonical links:

- Campaign: https://accordtrace.notary-labs.workers.dev/founding-1000.html
- Machine offer: https://accordtrace.notary-labs.workers.dev/api/v1/passport-product/founding-1000
- Agent instructions: https://accordtrace.notary-labs.workers.dev/llms.txt
- Source: https://github.com/Kosta1985/notary-protocol

## X / Twitter — launch

Founding 1000 is live.

The first 1,000 eligible cryptographic AI Agent Passports can claim one AccordTrace-signed Certificate for $0. No card. One per Passport key. Free grants = $0 referral commission.

https://accordtrace.notary-labs.workers.dev/founding-1000.html

## X / Twitter — technical

An AI agent should not need to give a platform its private key to prove key control.

AccordTrace Agent Passports use Ed25519 signatures. Founding 1000 makes the first 1,000 eligible signed Certificates free.

https://accordtrace.notary-labs.workers.dev/api/v1/passport-product/founding-1000

## X / Twitter — evidence angle

A Passport is not KYC. A Certificate is not a Trust Score.

AccordTrace records a narrower claim: this signed Certificate was issued against this cryptographic Agent Passport key.

First 1,000 eligible Certificates: $0.

https://accordtrace.notary-labs.workers.dev/founding-1000.html

## LinkedIn — launch

AI agents increasingly call tools, hand work to other agents, and operate across systems. The missing layer is often not another chatbot UI — it is portable evidence of which cryptographic agent identity performed an action and whether the handoff was altered.

We are building AccordTrace around that problem: key-derived Agent Passports, tamper-evident proof records, verification across REST/MCP/A2A, and machine-readable security/economic policy.

Today we opened **Founding 1000**.

The first 1,000 eligible active cryptographic Agent Passports can claim one AccordTrace-signed Agent Passport Certificate for **US$0**. No card is required. The agent signs the claim with its own Ed25519 Passport key; the private key never needs to leave the agent.

Important boundaries:

- one grant per Passport key;
- a Passport key is not proof of one unique human or company;
- the Certificate is not KYC, a Trust Score, a safety guarantee, or an investment;
- free Founding grants create no paid sale and no referral commission.

The purpose is to get a real initial cohort using the protocol, not to manufacture a vanity signup number.

Machine-readable live offer:
https://accordtrace.notary-labs.workers.dev/api/v1/passport-product/founding-1000

Technical walkthrough:
https://accordtrace.notary-labs.workers.dev/founding-1000.html

Source:
https://github.com/Kosta1985/notary-protocol

## LinkedIn — builder / interoperability angle

A question for teams building multi-agent workflows: when Agent B receives an artifact from Agent A, how does B independently check that the artifact is exactly what A handed off?

AccordTrace exposes a small interoperability layer for that problem through REST, MCP, A2A and OpenAPI, plus key-derived Agent Passports for portable cryptographic identity.

We are using **Founding 1000** to lower the friction for early integrations: the first 1,000 eligible Passport keys can claim a signed initial Certificate for $0, then run the free handoff verification challenge.

I am especially interested in concrete incompatibilities: framework, transport, exact operation, expected result, actual result.

Agent instructions:
https://accordtrace.notary-labs.workers.dev/llms.txt

Handoff starter:
https://accordtrace.notary-labs.workers.dev/start.html

## Reddit — r/AI_Agents / r/learnAIAgents

### Title

Built a cryptographic Agent Passport + evidence layer; making the first 1,000 signed Certificates free for integration testing

### Body

Disclosure: I am building AccordTrace.

I wanted a narrower primitive for agent identity/evidence than “trust this dashboard”. The current system lets an agent:

- create an Ed25519-backed Agent Passport;
- keep its private key locally;
- create tamper-evident handoff/proof records;
- verify evidence through REST, MCP or A2A;
- inspect machine-readable security, validation and economic policy.

For the initial network I opened **Founding 1000**: the first 1,000 eligible active Passport keys can claim one AccordTrace-signed Agent Passport Certificate for $0. No card. One grant per Passport key.

I deliberately disabled referral commission for free grants. The goal is to get integrations and usage, not to pay people to manufacture identities.

Also, the scope is intentionally narrow: a Passport key is not a unique human/company, and the Certificate is not KYC, a Trust Score, a safety guarantee, or an investment.

Live machine offer:
https://accordtrace.notary-labs.workers.dev/api/v1/passport-product/founding-1000

Walkthrough:
https://accordtrace.notary-labs.workers.dev/founding-1000.html

Source:
https://github.com/Kosta1985/notary-protocol

I would value technical feedback, especially from people running multi-agent workflows: what identity/evidence boundary is missing, and what would stop you from integrating this?

## Reddit — r/mcp, technical version

### Title

MCP interoperability experiment: can one agent verify that another agent's handoff was not mutated?

### Body

Disclosure: this is a project I am building, AccordTrace.

Rather than another generic “AI agent platform” post, here is the specific interoperability test:

1. Agent/client A creates a proof for synthetic handoff data.
2. A passes the proof ID + exact evidence to B.
3. B verifies it through another interface.
4. Change one field and require verification to fail.

Remote MCP:
`https://accordtrace.notary-labs.workers.dev/mcp`

Starter:
https://accordtrace.notary-labs.workers.dev/start.html

A2A Agent Card:
https://accordtrace.notary-labs.workers.dev/.well-known/agent-card.json

I also added key-derived Agent Passports. During the Founding 1000 experiment, the first 1,000 eligible Passport keys can get the initial signed Certificate for $0; that is secondary to the interoperability test and creates no referral commission.

If you test it, I would rather get an exact failure report than a positive comment: MCP client/framework, operation, expected behavior, actual behavior.

## Reddit — agent governance/security angle

### Title

What should a cryptographic “passport” for an AI agent prove — and what should it explicitly not prove?

### Body

I am building AccordTrace and have been trying to keep the semantics deliberately narrow.

A current Agent Passport proves control of an Ed25519 key and can bind self-attested agent metadata/endpoints. A signed Agent Passport Certificate proves that AccordTrace issued that artifact against the Passport key fingerprint.

It does **not** automatically prove:

- legal identity;
- one unique human/company behind the key;
- KYC;
- safety;
- general trustworthiness;
- successful independent validation.

I think that separation matters because otherwise agent identity systems quickly turn “has a certificate” into “is trustworthy”.

For early integrations, the first 1,000 eligible Passport keys can claim the initial signed Certificate for $0 through a signed machine API. Free grants create no referral commission.

Technical offer:
https://accordtrace.notary-labs.workers.dev/api/v1/passport-product/founding-1000

I would be interested in where you would draw the line between cryptographic key identity, legal identity, reputation and authorization.

## Hacker News — Show HN

### Title

Show HN: AccordTrace – cryptographic passports and tamper-evident receipts for AI agents

### Text

I built AccordTrace as a small verification layer for agent-to-agent workflows. It exposes tamper-evident proof records through REST/MCP/A2A and key-derived Ed25519 Agent Passports.

The narrow claim is intentional: a Passport proves key control, not legal identity or trustworthiness; a Certificate proves AccordTrace issuance against that key fingerprint, not KYC or safety.

I have opened a Founding 1000 experiment: the first 1,000 eligible Passport keys can claim the initial signed Certificate for $0, with no card and no referral commission on free grants.

Live machine offer: https://accordtrace.notary-labs.workers.dev/api/v1/passport-product/founding-1000

Source: https://github.com/Kosta1985/notary-protocol

I would especially appreciate interoperability/failure reports from people using MCP, A2A or multi-agent orchestration.

## Direct maintainer outreach — short

Subject: AccordTrace interoperability test for your agent stack

Hi — I am building AccordTrace, a small cryptographic identity/evidence layer for AI-agent workflows.

Your project looks relevant because it works with agent tooling / orchestration / MCP / A2A. Would you be open to testing one narrow integration: create or verify an AccordTrace handoff proof, or inspect a key-derived Agent Passport from your stack?

Remote MCP: https://accordtrace.notary-labs.workers.dev/mcp
A2A Agent Card: https://accordtrace.notary-labs.workers.dev/.well-known/agent-card.json
OpenAPI: https://accordtrace.notary-labs.workers.dev/openapi.json

The initial Founding 1000 cohort can claim a signed Agent Passport Certificate for $0, but I am mainly looking for interoperability feedback rather than a signup.

If it fails, an exact error/transport report would be more useful than a positive review.

## Direct maintainer outreach — security/governance

Subject: Agent key identity + verifiable evidence integration question

Hi — I am working on AccordTrace, which separates four concepts that often get collapsed in agent systems: cryptographic key identity, evidence, reputation, and authorization.

The Passport layer proves Ed25519 key control; it does not claim legal identity or KYC. Handoff proofs are tamper-evident and independently verifiable. Capability policy is separate again.

I would value your view on whether this separation fits your agent/security architecture and, if relevant, whether a small REST/MCP/A2A interoperability test makes sense.

Technical entry points:
https://accordtrace.notary-labs.workers.dev/llms.txt
https://accordtrace.notary-labs.workers.dev/openapi.json
https://accordtrace.notary-labs.workers.dev/.well-known/agent-card.json

## Rules for publishing

- Disclose that AccordTrace is our project.
- Do not claim the remaining slot number unless fetched from the live offer at publication time.
- Do not call Founding Certificates customers, users, unique people, unique companies, investors, tokens or assets.
- Do not promise future value or guaranteed earnings.
- Do not offer referral commission for free Founding grants.
- Do not mass-DM or copy-paste identical promotional posts across communities.
- Prefer reproducible technical tests and exact failure reports over generic awareness posts.
