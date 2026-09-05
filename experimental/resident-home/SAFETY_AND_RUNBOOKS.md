# Safety, data flow and operating drafts

Status: DRAFT. No external security, legal or accounting approval is represented.

## Data flow and trust boundary

Operator-owned local test process -> loopback HTTP with scoped bearer -> hashed
session lookup -> independent state authorization -> durable resource accounting ->
strict request parser -> SQLite reservation -> separate AES-GCM ciphertext file ->
transactional metadata/outbox finalize -> owned read or export -> operator data decoder.

The key remains in the local operator environment. Metadata includes pseudonymous
tenant/agent IDs, states, hashes, timestamps, quota counters and ciphertext paths.
Synthetic message text and counter state are decrypted only for an authenticated
local read. No billing details, personal identification document, medical/legal file,
model API credential, wallet seed, model weights or user executable is requested.

No network subprocessor is used by the offline flow. Repository and CI providers
receive source only when publishing this development branch; generated fixture
credentials, ciphertexts and local databases are excluded. The execution environment's
physical storage jurisdiction is not established. No AU-only or zero-knowledge claim.

## Risk register

| Risk | Accountable role (not assigned) | Current mitigation | Residual / launch blocker |
| --- | --- | --- | --- |
| Tenant or Passport misbinding | Identity engineering owner | Scoped local sessions; no public enrollment | Real Passport ownership-to-operator enrollment and MFA NOT IMPLEMENTED |
| Storage/accounting race | Storage engineering owner | BEGIN IMMEDIATE local fence, ciphertext-byte reservation, conservative cleanup | D1/R2 async saga, remote fault injection and concurrency NOT RUN |
| Loss of encryption key | Security owner | No export of development key; existing store needs original key | KMS/envelope keys, rotation and independent key recovery NOT IMPLEMENTED |
| Cloud invoice overrun | Budget owner | No cloud adapter; all paid paths unavailable; projected spend ceiling zero | Upstream request charges, retention, attacks and in-flight cost remain future risks |
| Data loss after crash or provider outage | Recovery owner | Local durable records, integrity check and explicit corruption errors | Independent provider, power-loss tests, clean-room restoration, RPO/RTO NOT RUN |
| Split brain / repeated external action | Runtime owner | Export cannot execute anything; permissions not stored in state | Action journal, live fencing epochs, reconciliation and external sink enforcement NOT IMPLEMENTED |
| Deleted data reappears | Privacy/recovery owner | Retained local tombstone denies a reintroduced object | Full control-plane backup deletion reconciliation and backup expiry NOT IMPLEMENTED |
| Sensitive text in inbox | Privacy/abuse owner | Synthetic-only fixture; encryption; bounded schema and best-effort pattern rejection | Pattern scans cannot prove absence of secrets or personal data |
| Local machine compromise | Operator/security owner | Loopback bind, scoped tokens, file permissions, no secret logging | Local admin can read keys and files; no defense claim against compromised host |
| Disk/index/WAL growth | Infrastructure owner | Request/object/write quotas; page-count 70% gate | Actual per-seat D1/index accounting, WAL bound and sharding NOT IMPLEMENTED |
| Misleading commercial cancellation | Billing owner | Endpoint explicitly says local entitlement only and never calls Stripe | Production portal, webhook reconciliation, refunds/disputes NOT IMPLEMENTED |
| Misleading economics | Finance owner | Gross/net/costs separate; operator counts separate; stress/zero-sale cases | Full cost quote, taxes, seller status and actual cohorts UNVERIFIED |

## Local integrity/export runbook

1. Authenticate to the loopback API with the owned scoped fixture token.
2. GET /snapshots/{id}/export. Keep the manifest and state together. Verify using
   verifyExport with the expected tenant, agent and exact accord-counter@1.0.0 version.
3. Do not copy auth tokens, encryption keys, local database permissions or billing
   columns into the data export. Never run dependency instructions from imported data.
4. On a corrupt current object, preserve the previous good checkpoint. The old-object
   deletion endpoint verifies the current object before removing an older checkpoint.
5. Unknown external operation outcomes cannot be handled by this counter decoder.
   Do not replay a real action. Stop and reconcile externally before considering it done.

## Local reservation reconciliation runbook

Stop the local listener before maintenance. Reopen only with the original key.
Call home.reconcileExpired(50), in bounded operator-controlled batches. Cleanup
confirms object absence under the local write fence before releasing reserved bytes.
Failed cleanup must keep the reservation. Never raise limits automatically to hide
failed reconciliation. No timer, cron or background retry loop is installed.
Accounting period rollover must be reviewed manually; expired periods close writes.

## Spend emergency / rollback

New cloud budget is zero. Do not deploy or connect a cloud object store from this
branch. Stopping the local server ends its foreground process. No per-agent idle
process or model API call remains. To roll back the unmerged source proposal,
close the draft PR; production has no dependency on this directory. Do not remove
user data, existing paid rights or wallet/referral records as part of rollback.

If future approved infrastructure overruns budget, freeze new costly operations,
preserve separately budgeted reads/export/cancellation, inspect actual provider
usage and reservations, stop retry storms, and escalate to the named budget owner.
This is a draft operating sequence, not an invoice ceiling guaranteed by software.

## Independent backup / disaster recovery

NOT IMPLEMENTED and NOT RUN. A local reopen with the original key is not independent
backup, two-provider failover or clean-room recovery. Do not sell disaster recovery.
Before a future test: approve provider, jurisdiction, budget, separate credentials,
recoverable key mechanism and a fresh policy/tombstone source. Restore data without
old grants, reauthenticate operators, reconcile billing, honor stop/revoke and legal
holds, and prove deleted data cannot be revived. Measure actual loss and recovery time;
do not promise RPO=0, guaranteed RTO or arbitrary exactly-once execution.

## Legal/accounting review pack: incomplete draft checklist, not approved terms

No live terms are generated from assumed seller details. The following drafts must
be completed by the relevant qualified owner before any paid pilot:

| Draft document | Required unresolved fields / decisions |
| --- | --- |
| Terms of Service | Actual seller, ABN/ACN where applicable, address, service scope, support, liability review, dispute contact |
| Privacy notice and collection notice | Purposes, minimum data, access, physical processing locations, retention, access/correction, overseas disclosure |
| Data Processing Addendum | Parties, roles, instructions, subprocessors, security schedule, incident duties, deletion/return |
| Acceptable Use Policy | Synthetic/non-regulated pilot, prohibited sensitive data, abuse contact, complaint triage, suspension/review |
| Cancellation/refund policy | Recurring price/GST/period, self-service cancellation, grace cost approval, non-delivery/refund/dispute handling |
| Retention/deletion schedule | Current/history/staging/outbox/logs, tombstones, key deletion, backup expiry and legal holds |
| Subprocessor register | Actual provider, service, geography, contractual terms, key/support access, verified recovery |
| Incident-response policy | Human owner, severity/escalation, evidence preservation, applicable notification review |
| Recovery policy | Supported format/runtime, measured recovery scope, fencing limitations, independent backup and deleted-data tests |

Professional review must consider the brief's ACL, privacy/APP/NDB, GST, marketing,
international processing and referral-program questions for the actual business.
This document makes no applicability or compliance determination. No referral payouts,
live payment, government identity claim, insurance or financial service is introduced.
