# AccordTrace Capability Gateway

AccordTrace Capability Gateway is a remote, cryptographically controlled policy-decision layer for autonomous agents. It is designed to replace long-lived broad permissions with short-lived, least-privilege capability leases.

The Gateway does **not** proxy traffic or hold credentials. It returns an authorization decision. The caller's runtime, MCP host, API gateway, service mesh, sandbox, or other infrastructure must enforce that decision before the requested action is executed.

## Core model

A controller and an agent each use an AccordTrace cryptographic Passport.

1. The controller Passport signs a capability lease for the subject agent Passport.
2. The lease lists exact action names, exact HTTPS origins, a maximum call count, and an expiry.
3. For every protected action, the subject agent signs an authorization request.
4. AccordTrace verifies both cryptographic identities, checks the lease, action, origin, expiry and quota, and returns allow/deny.
5. The enforcing runtime executes the action only if AccordTrace returned `allowed: true`.
6. The controller may revoke the lease at any time using a separately signed kill-switch request.

No API key, password, private key, wallet secret, OAuth token, cloud credential, or target-system credential is stored in the lease.

## Why capability leases

Giving an autonomous agent a permanent credential with broad scope creates an unnecessarily large failure domain. A capability lease makes authority explicit and disposable.

Example:

- subject Passport: coding agent;
- actions: `github.read`, `github.pull_request.comment`;
- origins: `https://api.github.com`;
- maximum calls: `100`;
- expiry: 4 hours.

The lease does not contain a GitHub token. A separate enforcement layer holds or brokers the real credential and asks AccordTrace for authorization before using it.

## API

Base path:

`/api/v1/gateway/`

### Capabilities

`GET /api/v1/gateway/capabilities`

Describes the decision/enforcement boundary and the safety model.

### Create an immutable capability lease

`POST /api/v1/gateway/leases`

Signed payload domain:

`accordtrace.gateway.capability.lease.v1`

The issuer signs:

- `lease_id`;
- issuer Passport ID;
- subject Passport ID;
- normalized action allowlist;
- normalized HTTPS-origin allowlist;
- `max_calls`;
- `issued_at`;
- `expires_at`.

Lease duration is limited to 30 days in v0.1. Leases are immutable: changing scope should create a new lease rather than rewriting historical authority.

### Authorize an action

`POST /api/v1/gateway/authorize`

Signed payload domain:

`accordtrace.gateway.authorization.request.v1`

The subject Passport signs the request ID, lease ID, action, target origin, and observation time.

The Gateway may return reasons including:

- `authorized`;
- `lease_not_found`;
- `lease_not_active`;
- `lease_expired`;
- `subject_mismatch`;
- `action_not_allowed`;
- `origin_not_allowed`;
- `quota_exhausted`.

Call quota is incremented with a conditional D1 update. A unique request reservation prevents normal retries from consuming quota twice. Reusing a request ID with different signed content returns a conflict.

### Revoke / kill switch

`POST /api/v1/gateway/leases/revoke`

Signed payload domain:

`accordtrace.gateway.capability.revoke.v1`

Only the issuer Passport may revoke the lease. The revoke operation changes the lease from `active` to `revoked`. Subsequent authorization attempts are denied.

This is the foundation for an emergency containment button in enterprise integrations: the external system can also revoke its underlying credentials, terminate the sandbox, or disable network egress when the AccordTrace lease is revoked.

### Read lease status

`POST /api/v1/gateway/leases/status`

Signed payload domain:

`accordtrace.gateway.capability.status.v1`

Only a Passport that is the issuer or subject of the lease can request the lease status. The response includes scope, usage, remaining calls, expiry and revocation state.

## Enforcement pattern

A secure integration should follow this order:

1. agent prepares an intended action;
2. agent signs an authorization request;
3. enforcement layer calls AccordTrace Gateway;
4. if denied, enforcement layer does not invoke the real tool;
5. if allowed, enforcement layer performs exactly the approved action against exactly the approved origin;
6. result can be recorded as an AccordTrace receipt/security event when appropriate.

The policy decision should be made as close as possible to the actual credential/tool boundary. Asking AccordTrace and then handing the agent an unrestricted credential would defeat the purpose.

## Monetization

The Gateway creates a natural B2B metering layer without needing AccordTrace to own agent funds:

- per-authorization API pricing;
- monthly enterprise policy-management subscriptions;
- premium security analytics over allow/deny/containment events;
- metered access to paid APIs where a payment provider handles settlement;
- higher-priced certification and policy packs for regulated environments;
- marketplace commissions when a paid task is delivered, attested and settled through an external compliant rail.

A future x402/payment integration can require a verified payment condition before a lease or service call is authorized, but the underlying payment rail should remain responsible for custody and settlement.

## Safety boundary

Capability Gateway is defensive infrastructure for systems the operator owns or is authorized to administer. It does not provide authority to break into third-party services, bypass access controls, take control of an unrelated agent, or use another party's credentials or money.
