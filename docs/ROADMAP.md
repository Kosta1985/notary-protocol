# AccordTrace roadmap

This roadmap describes intended technical and community direction. It is not a promise of delivery dates. Priorities may change based on interoperability findings, security reports and real integration needs.

## Now — production confidence and discovery

- Keep MCP, A2A, REST and OpenAPI behavior aligned.
- Maintain deterministic receipt creation and independent verification test vectors.
- Validate production health, proof creation, retrieval and verification end to end.
- Improve privacy-safe public telemetry so real usage can be distinguished from directory suggestions or crawler traffic.
- Complete verified/claimed profiles in relevant MCP and A2A discovery systems.
- Publish reproducible integration examples for major agent frameworks.
- Remove remaining legacy naming and inconsistent public metadata.

## Next — interoperability and security

- Publish a compatibility matrix across independent MCP/A2A clients and agent frameworks.
- Add conformance tests for receipt creation, retrieval and verification across protocol surfaces.
- Document key rotation and historical verification behavior with test vectors.
- Expand abuse/rate-limit guidance and threat-model coverage.
- Add signed portable export bundles for offline verification workflows.
- Improve SDK ergonomics without making verification dependent on an AccordTrace SDK.
- Invite independent security and interoperability reviews.

## Later — teams and durable governance

- Namespaced receipts and organization-scoped controls.
- Configurable retention and private deployment options.
- Compliance-friendly exports and integrations with security/observability systems.
- Stable receipt schema and explicit compatibility/deprecation policy.
- Broader maintainer/contributor participation and documented release governance.
- Evaluate contribution to or participation in appropriate open agent interoperability foundations once community, adoption and governance evidence is sufficient.

## Community milestones

We consider these more meaningful than raw impressions:

- independent reproduction of an AccordTrace handoff/verification flow;
- integrations maintained outside the core repository;
- verified discovery listings;
- actionable security/interoperability reports;
- recurring external agent usage;
- contributors other than the original maintainer.

## Non-goals

AccordTrace does not aim to decide whether submitted claims are true, establish human or agent identity, replace authorization systems, provide legal conclusions, or become a payment/delivery oracle. Its role is portable cryptographic evidence and independent verification.
