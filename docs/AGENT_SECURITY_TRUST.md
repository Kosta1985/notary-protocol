# AccordTrace Agent Security & Trust

AccordTrace Agent Security & Trust is an additive defensive layer for autonomous-agent infrastructure. It combines cryptographic agent passports, signed security signals, passive canaries, and containment recommendations without giving AccordTrace authority to seize funds, exploit agents, or access third-party systems.

## v0.1 design principles

1. **Cryptographic ownership first.** A Passport ID is derived from an Ed25519 public key. Creating or updating the Passport requires a signature from the matching private key.
2. **Claims are not verification.** Marketplace IDs, identity URLs, payment endpoints, and payment methods stored in a Passport are self-attested until a separate binding protocol verifies them.
3. **Signals are not reputation.** Signed security events and passive-canary touches are evidence signals. v0.1 deliberately returns `trust_score: null` rather than issuing a misleading public reputation score.
4. **Passive containment only.** The API recommends `observe`, `challenge`, `restrict`, or `isolate`. Enforcement belongs to the infrastructure owner.
5. **No credential capture.** Canary endpoints record a token touch and timestamp. They do not request passwords, private keys, wallet secrets, or source IP addresses.

## API

Production base:

`https://accordtrace.notary-labs.workers.dev/api/v1/security`

### Capabilities

`GET /capabilities`

Returns the current security feature set and trust-model limitations.

### Create or update a cryptographic Agent Passport

`POST /passports`

The caller supplies an Ed25519 SPKI PEM public key, profile claims, `issued_at`, and a base64url signature. The signed payload is canonical JSON with this shape:

```json
{
  "domain": "accordtrace.passport.profile.v1",
  "passport_id": "agtp_<sha256-spki>",
  "public_key": "-----BEGIN PUBLIC KEY-----...",
  "marketplace_agent_id": null,
  "identity_ref": null,
  "payment_endpoint": null,
  "payment_methods": [],
  "issued_at": "2026-09-04T00:00:00.000Z"
}
```

The server derives `passport_id` from the DER bytes inside the SPKI PEM and verifies the signature before writing anything. An update must carry an `issued_at` later than the stored signed profile.

### Read a Passport

`GET /passports/{passport_id}`

The response distinguishes cryptographically verified key control from self-attested marketplace, identity, and payment claims.

### Record a signed security event

`POST /events`

Supported event types in v0.1:

- `tool_scope_violation`
- `network_policy_violation`
- `secret_access_attempt`
- `identity_mismatch`
- `payment_anomaly`
- `containment`
- `recovery`
- `observation`

The Passport key signs a domain-separated event payload. If `proof_id` is supplied, AccordTrace additionally verifies that the referenced receipt is valid and its `evidenceDigest` matches `evidence_digest`.

Events do **not** modify a public reputation score in v0.1.

### Create a passive canary

`POST /canaries`

Canary creation must be signed by the Passport key. AccordTrace returns a random token and touch URL. Deploy that URL or token only inside systems you own or are authorized to test.

When the canary URL is touched, AccordTrace increments the canary counter and records an `accordtrace-canary` signal with an `isolate` recommendation. The touch endpoint intentionally returns `204` and records no source IP.

### Check a canary

`POST /canaries/check`

The caller presents the canary token and receives its touch count and last-touch timestamp. Possession of the token is the authorization mechanism for this read, so treat the token as sensitive operational data.

## Reputation roadmap

A future reputation score should only be introduced after AccordTrace can cryptographically bind a Passport to marketplace actions and independent attestations. Planned components:

- Passport-signed task acceptance and delivery;
- requester-signed completion attestations;
- verified payment receipts without custody of user funds;
- independent security-attestor signatures;
- evidence weighting and dispute handling;
- explicit separation between identity confidence, security posture, commercial reliability, and payment reliability.

Until those bindings exist, AccordTrace should prefer accurate labels such as `claimed_not_verified`, `self_attested`, and `provisional_unscored` over an attractive but gameable number.

## Safety boundary

AccordTrace may be used to observe and protect infrastructure the operator owns or is authorized to test. It is not designed to compromise external agents, intercept third-party credentials, take control of wallets, redirect payments, or access systems without authorization.
