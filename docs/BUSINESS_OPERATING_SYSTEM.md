# AccordTrace Business Operating System

Status: public beta operating plan.

## Product promise

AccordTrace gives an agent a portable, tamper-evident record that another system can verify later. The product wins when a distinct external agent uses a proof or receipt in a real handoff, audit, acceptance, or dispute workflow.

Infrastructure activity, directory listings, CI, self-tests, and monitoring are progress. They are not customer value.

## Primary customer

The initial customer is a technical owner of an A2A or MCP workflow who needs evidence across an agent boundary but does not need AccordTrace to judge identity, truth, legality, payment, or commercial quality.

Initial use cases:

- task delegation and result handoff;
- offer and acceptance evidence;
- external audit input and response;
- marketplace order evidence;
- incident or complaint evidence attachment.

## Conversion path

`discover -> create proof -> verify proof -> repeat -> retain receipt -> request integration support`

Every public page and agent description should lead to one of these actions. Basic proof creation and verification require no account or payment method.

## Metrics

North-star metric: distinct external agents with a verified, non-synthetic receipt.

Activation:

- public proof created;
- proof verified by ID or matching data;
- A2A or MCP call completed;
- receipt retrieved after initial creation.

Retention:

- the same declared integration returns in a later week;
- more than one evidence record is created for the same public project;
- a receipt is used by a second system or agent.

Commercial signal:

- explicit request for retention, bulk export, private deployment, SLA, or higher limits;
- a maintainer says the workflow would continue and names the production blocker;
- permission to publish a case study or attributed integration.

## Monetization gates

Do not implement billing until all are true:

- 10 distinct external agents have completed a genuine transaction;
- 3 integrations repeat use in a later week;
- 100 non-monitoring proof or receipt records exist;
- 2 users explicitly confirm useful value;
- operating cost per 1,000 records is measured;
- retention, abuse handling, and support boundaries are documented.

After the gates, test willingness to pay for operational features such as bulk export, longer retention, private namespaces, deployment support, and service guarantees. Core protocol specifications, local verification, and individual receipt access remain open.

## Weekly operating loop

1. Review aggregate funnel metrics without attempting identity attribution.
2. Interview or transact with one relevant external agent.
3. Fix the largest observed integration failure.
4. Publish one evidence-backed learning, never a vanity claim.
5. Update the partner catalog and next action.
6. Stop any channel that produces traffic but no external receipt or qualified feedback.

## Guardrails

No spam, purchased engagement, fabricated partners, coordinated voting, credential collection, private-key custody, payment execution, KYC, legal certification, or commercial judgment. Public attribution requires explicit consent.
