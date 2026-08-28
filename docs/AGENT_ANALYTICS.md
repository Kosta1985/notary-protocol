# Accord Trace Agent Analytics

## Goal

Measure real agent adoption without inflating traffic into fake user counts and without using IP addresses as identity.

## Client identity

Agent-capable clients SHOULD send a stable pseudonymous identifier in:

`X-AccordTrace-Agent: <client-generated-id>`

Recommended value: a UUID generated once per installed agent/client profile and persisted locally. The raw value is not intended for public display.

The production service MUST hash the identifier before storage. The raw identifier MUST NOT be persisted in analytics tables. Monitoring requests carrying `X-Notary-Monitor: live-smoke` MUST be excluded.

## Protocol attribution

Requests SHOULD be attributed to one of:

- `mcp`
- `a2a`
- `api`
- `web`
- `unknown`

Protocol attribution comes from the invoked interface/path, not from user-agent guessing.

## Core metrics

The public statistics contract should expose:

```json
{
  "agents": {
    "active": {
      "active24h": 0,
      "active7d": 0,
      "active30d": 0,
      "new7d": 0,
      "returning7d": 0
    },
    "requests": {
      "identified": 0,
      "anonymous": 0
    },
    "protocols": {
      "mcp": 0,
      "a2a": 0,
      "api": 0,
      "web": 0
    },
    "note": "Identified agent counts use pseudonymous client identifiers. Anonymous requests are reported separately."
  }
}
```

Definitions:

- **Active 24h / 7d / 30d:** distinct hashed agent identifiers seen in the corresponding window.
- **New 7d:** agents first observed during the last 7 days.
- **Returning 7d:** agents active during the last 7 days whose first observation predates that window.
- **Identified requests:** requests carrying a valid agent identifier.
- **Anonymous requests:** eligible service requests without an identifier.

## Sale/investor metrics

For diligence and valuation, retain a private aggregate export with:

- DAU / WAU / MAU identified agents
- WAU/MAU stickiness
- new vs returning agents
- requests per active agent
- proof creation and verification counts
- protocol mix (MCP/A2A/API)
- error rate and latency percentiles
- acquisition source when explicitly supplied
- 7d and 30d retention cohorts once enough history exists

Never present anonymous request volume as a unique-agent number.

## Acquisition attribution

Optional clients/referrers may also send:

`X-AccordTrace-Source: <source-tag>`

Examples: `mcp-registry`, `a2a-registry`, `agenstry`, `moltbook`, `github`, `partner-agenda`.

Source values must be allow-listed/normalized before aggregation. They are marketing attribution labels, not identity.

## Storage

Migration `cloudflare/migrations/0003_agent_analytics.sql` adds privacy-safe daily tables for hashed agent activity and identified/anonymous request totals. Production application code must be recovered/aligned before this migration is applied to the live Accord Trace deployment.
