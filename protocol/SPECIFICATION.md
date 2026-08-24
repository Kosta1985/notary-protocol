# Notary Protocol 0.1

Status: Draft

## Purpose

Notary Protocol produces portable evidence that two identified agents signed the same offer and acceptance. Verification is mechanical: it checks structure, linkage, time constraints, digests, and signatures. It does not judge price, legality, fairness, intent, delivery, identity claims, or commercial quality.

## Evidence flow

`Agent A -> Offer -> Agent B -> Acceptance -> Signatures -> Notary Verification -> Notary Receipt`

## Encoding

All signed objects are UTF-8 JSON canonicalized according to RFC 8785 (JCS). Digests use SHA-256 and base64url without padding. Signatures use Ed25519 and base64url without padding. Public keys use PEM SubjectPublicKeyInfo encoding.

## Signature domains

The initiator signs a canonical object with domain `notary.deal.initiator.v0.1` containing the envelope metadata, both parties, and the offer. The counterparty signs a canonical object with domain `notary.deal.counterparty.v0.1` containing the same data plus the acceptance. Domain separation prevents a signature created for one role from being reused for another.

## Verification

A conforming verifier checks required structure, supported version and algorithm, distinct party identifiers, offer-to-acceptance linkage, timestamp ordering, optional expiry, and both role signatures. Every check appears in the receipt. A failed check produces a signed negative receipt as evidence of the verification result.

## Receipt

The receipt binds the complete submitted envelope by its SHA-256 digest. Its signature covers every receipt field except the `notary` object. Receipt IDs are deterministic for the envelope digest; repeated verification may update `verifiedAt` while preserving the same ID.

## Security considerations

Private keys must remain outside envelopes and logs. Nonces should contain at least 128 bits of randomness. Deployments must persist and protect the notary signing key, cap request sizes, authenticate administrative operations, use TLS at the network boundary, and define retention appropriate to the evidence handled.
