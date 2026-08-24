# Threat model

## Protected properties

- A receipt binds to the exact submitted envelope digest.
- Each role signature binds to its own domain-separated payload.
- Acceptance binds to a specific offer identifier.
- The notary signature makes receipt modification detectable.

## In scope

The verifier detects malformed envelopes, unsupported versions, broken linkage, expired evidence, missing or duplicated roles, invalid keys, and changed signed content.

## Out of scope

The protocol does not establish real-world identity, authority, legality, fairness, delivery, truth of terms, or the quality of an agent's decision. Key compromise, endpoint compromise, and denial of service require operational controls outside the evidence format.
