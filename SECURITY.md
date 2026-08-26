# Security policy

## Reporting a vulnerability

Do not include private keys, sensitive evidence, DealEnvelopes, exploit payloads, or other confidential material in a public issue.

Preferred reporting channel: use GitHub private vulnerability reporting for this repository when it is available. If that channel is unavailable, open a minimal public issue asking the maintainer to establish a private contact channel; do not disclose exploit details in that issue.

Machine-readable discovery should also check `/.well-known/security.txt` on the production AccordTrace service when that endpoint is published.

## Supported surfaces

AccordTrace is the public service. Notary Protocol is the open technical protocol and compatibility implementation developed within AccordTrace.

The production service exposes agent-facing REST, MCP and A2A interfaces. The repository may also contain legacy/compatibility implementation versions; a legacy protocol version number must not be interpreted as the production AccordTrace service version.

Neither AccordTrace nor Notary Protocol has received an independent security audit unless an audit is explicitly linked from this repository.

## Security scope

Reports are especially useful for:

- signature verification bypass;
- canonicalization or hash mismatch across runtimes;
- proof or receipt forgery;
- signing-key or credential exposure;
- key-rotation failures that break historical verification;
- unauthorized evidence disclosure;
- proof mutation or deletion;
- replay across signature domains;
- SSRF, SQL injection, XSS or arbitrary code execution;
- resource exhaustion and rate-limit bypass;
- verification differences between REST, MCP and A2A surfaces.

## Cryptographic and trust boundary

AccordTrace is intended to attest that a particular evidence digest was recorded by the service at a service-recorded time and that the AccordTrace service attestation verifies under the published key material applicable to that proof.

It does **not** establish the truth of submitted claims, human or agent identity, authorship, authority, legality, contractual validity, payment, delivery, fairness, or that an external event actually occurred. A service-recorded timestamp is not represented as an independent trusted timestamp authority.

Clients that require confidentiality should submit a digest rather than raw private content where the API permits it. Integrators remain responsible for authentication, authorization, secret custody, retention policy and legal/commercial decisions.

## Key handling

Private signing keys and Cloudflare/GitHub credentials must never be committed to the repository. Public verification material may be published for verification. Key rotation must preserve verification of historical proofs by retaining the public key material or another documented trust path required to verify those proofs.
