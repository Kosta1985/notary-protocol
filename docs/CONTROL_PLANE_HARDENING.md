# AccordTrace Control Plane Hardening

This layer sits in front of the Phase 7 Control Plane maintenance/session routes. It is defensive infrastructure for customer-owned or customer-authorized systems only.

## Required production secret

`CONTROL_PLANE_RBAC_JSON`

JSON array of root operator records. Store only SHA-256 token hashes, never plaintext root tokens.

Example structure (placeholders only):

```json
[
  {"operator_ref":"security-admin","role":"admin","token_sha256":"<64-hex-sha256>"},
  {"operator_ref":"soc-responder","role":"responder","token_sha256":"<64-hex-sha256>"}
]
```

## Optional production configuration

- `CONTROL_PLANE_ALERTS_JSON`: server-side customer alert integrations. Request bodies cannot supply delivery URLs.
- `CONTROL_PLANE_RATE_LIMIT_PER_MINUTE`: per-operator/per-route minute limit, clamped to 10–600; default 60.
- `CONTROL_PLANE_DELIVERY_RETENTION_DAYS`: delivery-log retention, clamped to 7–3650; default 90.
- `CONTROL_PLANE_USAGE_RETENTION_DAYS`: usage-metric retention, clamped to 30–3650; default 400.
- `CONTROL_PLANE_SMOKE_TOKEN`: CI/operator environment only, never Worker configuration; used by `npm run smoke:control-plane` for authenticated post-deploy smoke checks.

Supported alert adapter types are:

- `webhook` — generic customer-owned HTTPS JSON receiver;
- `slack_webhook` — Slack Incoming Webhook-compatible HTTPS payload;
- `email_relay` — customer-owned HTTPS mail relay; AccordTrace does not hold SMTP credentials or operate a mailbox.

Generic webhook example:

```json
{
  "id":"soc-primary",
  "type":"webhook",
  "enabled":true,
  "url":"https://customer.example/security/accordtrace",
  "signing_secret":"<secret>",
  "bearer_token":"<optional-secret>"
}
```

Slack Incoming Webhook example:

```json
{
  "id":"security-slack",
  "type":"slack_webhook",
  "enabled":true,
  "url":"https://hooks.slack.com/services/<customer-managed-path>"
}
```

Customer email relay example:

```json
{
  "id":"security-email",
  "type":"email_relay",
  "enabled":true,
  "url":"https://customer.example/mail-relay/accordtrace",
  "to":"security@example.com",
  "signing_secret":"<secret>"
}
```

All adapter URLs must be HTTPS and cannot contain URL userinfo. Secrets such as `bearer_token` and `signing_secret` are transport configuration only; they are never copied into alert bodies or console responses. Alert bodies are rebuilt from a strict redacted field allow-list rather than forwarding arbitrary event objects.

## Signed delivery format

When `signing_secret` is configured, the hardened outbox adds:

- `X-AccordTrace-Timestamp`: Unix timestamp in seconds.
- `X-AccordTrace-Event-Digest`: 64-hex event digest.
- `X-AccordTrace-Signature`: `v1=<hex HMAC-SHA256>` over `<timestamp>.<raw-outbound-json-body>`.

The HMAC therefore covers the actual adapter-specific body delivered to the receiver. Receivers should verify the HMAC over the exact raw request body, enforce a short timestamp tolerance, and deduplicate using the event digest.

## Alert delivery semantics

Alerts are first written to `control_plane_alert_outbox` and deduplicated by `(integration_id, event_digest)`. Delivery is bounded to five attempts with backoff of approximately 1 minute, 5 minutes, 30 minutes, 2 hours and 6 hours. Exhausted items move to `dead_letter`; no unbounded retry loop is permitted.

The same outbox/retry/dead-letter path supports generic webhooks, Slack webhooks and customer email relays. Unsupported adapter types fail closed rather than silently falling back to an unintended transport.

## Operator sessions

Root RBAC tokens can mint short-lived session tokens for equal or lower roles only. Sessions:

- expire after at most 12 hours;
- cannot mint child sessions;
- cannot escalate role;
- can be revoked by their owner or an admin;
- are stored server-side only as SHA-256 hashes.

The browser should keep session tokens in memory only. Do not persist them to localStorage or sessionStorage.

## Retention

Automated retention may delete old alert-delivery logs, hook-delivery logs and daily usage rows. It MUST NOT delete `control_plane_audit`. The operator audit chain remains append-only; each automated retention run records `audit_rows_deleted = 0` by schema constraint.

## Production smoke

Unauthenticated fail-closed check:

```sh
npm run smoke:control-plane -- https://accordtrace.notary-labs.workers.dev
```

Authenticated check after control-plane secrets/configuration are configured:

```sh
CONTROL_PLANE_SMOKE_TOKEN='<short-lived-token>' npm run smoke:control-plane -- https://accordtrace.notary-labs.workers.dev
```

A result of `not_deployed_yet` is acceptable before the new Worker version is deployed; it must not be described as live.
