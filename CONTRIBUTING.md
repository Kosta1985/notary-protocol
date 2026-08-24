# Contributing

Notary Protocol is an early public draft. Contributions should improve interoperability, evidence clarity, security, or implementation quality without expanding Notary into commercial or legal decision-making.

## Start here

1. Read `protocol/SPECIFICATION.md` and `docs/THREAT_MODEL.md`.
2. Search existing issues before opening a new one.
3. For protocol changes, include a concrete envelope, expected receipt, and threat or interoperability rationale.
4. Run `npm test` before submitting code.

## Change categories

- **Protocol:** schemas, canonicalization, signature domains, receipt semantics. Requires test vectors and compatibility discussion.
- **Implementation:** API, storage, SDKs and verifier. Must preserve the published protocol behavior.
- **Integration:** MCP, A2A, examples and deployment targets. State the exact external revision supported.
- **Documentation:** clarify behavior without inventing guarantees that the implementation does not provide.

## Design boundaries

Do not add transaction judgment, identity claims, legal conclusions, delivery assertions, payment handling, or unrelated dependencies. Notary verifies submitted cryptographic evidence only.

## Pull requests

Keep changes focused. Describe the behavior before and after, tests added, security impact, and compatibility impact. Protocol changes should begin as an issue unless they only fix an unambiguous defect.
