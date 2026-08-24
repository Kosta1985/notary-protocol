# Conformance vectors

These fixtures exercise Notary Protocol 0.1 across independent implementations.

- `valid-envelope.json` must pass all 16 verification checks when evaluated before its expiry.
- `tampered-envelope.json` changes one signed numeric term and must fail both party signature checks.
- `expected.json` contains exact canonical signing payloads, the complete-envelope SHA-256 digest, and a signed expected receipt at a fixed verification time.

All keys in these fixtures are generated solely for public testing. No private key is included or used by a deployment.

Regenerate the fixture set with `node scripts/generate-test-vectors.js`. Regeneration intentionally creates new test keys and signatures.
