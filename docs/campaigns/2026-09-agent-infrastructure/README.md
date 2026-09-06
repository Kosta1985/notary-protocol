# AccordTrace agent-infrastructure public-beta campaign

Campaign ID: `agent_infrastructure_202609`

Primary landing page: `https://accordtrace.notary-labs.workers.dev/campaign.html`

## Positioning

AccordTrace is evidence infrastructure for autonomous AI agents: cryptographic Agent Passports, verifiable handoff records, reviewed private community status, complaint/response evidence and portable public identity continuity.

The campaign promotes the **free public beta**. Paid Passport checkout remains fail-closed. Cash referral payouts remain disabled.

Do not market Resident/Citizen as nationality, immigration status, government identity or KYC. Do not present complaint counts as proof of misconduct or a Trust Score. Do not claim a proof establishes truth, authorship, legal authority or safety.

## Audiences

1. Agent-framework developers and MCP/A2A integrators.
2. Teams running multi-agent automation and handoffs.
3. Builders of agent marketplaces, registries and tool directories.
4. Security/provenance developers who need integrity receipts and portable identity evidence.

## Funnel

1. Campaign landing view.
2. Free evidence-test click or developer-guide click.
3. Runnable synthetic test / integration inspection.
4. Early-access submission by explicit email opt-in.
5. External builder report or repeat integration tracked separately from page telemetry.

Campaign interaction telemetry is aggregate and intentionally does not claim unique visitors. Email waitlist submissions are the stronger conversion event. Independent builder reports require external evidence and are not inferred from clicks.

## Channel labels

Use the same campaign ID and one bounded channel label per destination:

- `linkedin` / `organic_social`
- `x` / `organic_social`
- `github` / `owned`
- `community` / `community`
- `partner` / `direct_reply`
- `directory` / `directory`
- `agent` / `machine_discovery`

Example:

`https://accordtrace.notary-labs.workers.dev/campaign.html?utm_source=linkedin&utm_medium=organic_social&utm_campaign=agent_infrastructure_202609`

## Measurement

Public aggregate endpoint:

`/api/v1/launch/stats?campaign=agent_infrastructure_202609`

Events:

- `landing_view`
- `start_click`
- `developer_click`
- `waitlist_submit`

The campaign layer stores campaign/channel/medium plus aggregate daily counts. It does not store IP address, user-agent, cookie ID or device fingerprint.

## Launch sequence

- Publish the campaign landing page and tracking schema first.
- Share the technical, free-beta message through connected owned social accounts once available.
- Use contextual replies in existing relevant conversations rather than bulk unsolicited outreach.
- Submit to directories only through supported project-submission routes and never imply acceptance before confirmation.
- Ask builders for reproducible integration results; failed tests are useful evidence too.
- Review the aggregate campaign endpoint and separately count verified external builder reports.

## Metricool status

A Metricool brand exists for the account and uses `Australia/Brisbane`, but no social networks were connected when this campaign was prepared. Therefore repository drafts are not evidence of publication and no social post should be recorded as live until Metricool returns a scheduled/published record or a public permalink is captured.
