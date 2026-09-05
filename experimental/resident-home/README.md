# Accord Trace Resident Home: offline reference, not a launched service

This is **Stage 0 plus an initial Stage 1 implementation** of the supplied
2026-09-05 Passport + Resident Home brief. It is not completion of the full brief.
Use synthetic data only. Nothing in this directory is imported by the production
Worker. No Cloudflare binding, production migration, price, wallet, referral,
Passport contract, UI or deployment workflow is changed.

## Run locally

Node.js 22.16 or newer is required for the local `node:sqlite` harness.
No npm install, model API key, container, cloud account or Stripe call is needed.
Run from the repository root:

```sh
node --test experimental/resident-home/resident-home.test.mjs
node experimental/resident-home/local.mjs demo
node experimental/resident-home/http-smoke.mjs
node experimental/resident-home/economics.mjs
npm test
npm run production:check
```

To run the loopback API, explicitly start:

```sh
node experimental/resident-home/local.mjs serve
```

The bounded HTTP smoke starts a disposable local server, runs 11 synthetic checks,
stops it and removes its temporary data. It is not a hosted-runtime migration test.

The process binds only `127.0.0.1:8788`. It writes the generated scoped test token
to `experimental/resident-home/.local/dev-access.json`, mode 0600, and the original
local encryption key to `encryption-key-v1.bin`, mode 0600. It prints their path,
not their values. `.local/` is ignored by Git. Never upload this directory, tokens,
keys or real data to a public repository. Stop with Ctrl+C. The server has no
public signup, login or renewal service; local sessions expire after seven days.
The thirty-day export grace is a fixture, not a commercial promise. Fresh authorized
sessions are needed after expiry. Production enrollment/renewal remains unimplemented.

Example authenticated local call from another terminal (prints no token):

```sh
node --input-type=module -e '
import fs from "node:fs";
const {token}=JSON.parse(fs.readFileSync("experimental/resident-home/.local/dev-access.json"));
const r=await fetch("http://127.0.0.1:8788/api/v1/resident-home/profile",{headers:{authorization:`Bearer ${token}`}});
console.log(r.status,await r.json());'
```

## Implemented boundary

Local fixture identity uses an existing caller-supplied stable `agent_id`; it does
not issue or verify a production Passport. Four independent state columns preserve
membership, billing, runtime and credential status. Credentials are tenant-and-agent
scoped, stored as hashes and rechecked after asynchronous body reads.

Metadata, inbox records, outbox status and reservations persist in local SQLite.
Ciphertexts live in a separate local filesystem object store, never a payload column
in the metadata database. AES-256-GCM binds each object to its tenant, agent and
object ID. Format RH01 supports one development key version; production envelope
keys, KMS, rotation and independent key recovery are **not** implemented. The server
can decrypt content, so this is neither E2EE nor zero-knowledge storage.

Each creation reserves actual ciphertext bytes and an object slot in an atomic local
transaction across project, tenant and agent limits. Requests, received ingress,
write attempts and message creation are bounded. There are at most two pending uploads.
Failed or conflicting retries still consume request/ingress allowances. Unknown cleanup
retains its reservation. Local writes are fenced against expired/aborted reservations.
Cancel and explicit snapshot export have separate bounded maintenance allowances, rather
than depending on an exhausted normal request/read allowance. These are resource counters,
not transferable or spendable customer balances.

The first checkpoint is deliberately **only** `accord-counter@1.0.0`: numeric counter,
consistent step and bounded completed-operation IDs. Arbitrary agent memory, model weights,
provider sessions, files, dependencies and secrets are not supported. Both manifest and
payload hashes are checked. Integrity is service-recorded SHA-256, not an issuer signature,
proof of truth, legal identity or behavioral safety. Export does not execute anything.
A compatible in-process data decoder is demonstrated, not two independent hosted runtimes.

Inbox messages are limited to a 32,000-byte complete JSON envelope. Persistent outbox state
is inserted with the message metadata. The local notification-state helper caps attempts
at three and deduplicates acknowledgement, but does not send a queue event or invoke any
external action. Message secrecy detection is best-effort and cannot establish absence
of sensitive data. No user-supplied URLs, HTML rendering or outgoing requests are supported.

## Important limits of this implementation

Project and tenant ceilings in the fixture deliberately default to the same conservative
values as a single seat; provisioning 100 seats does not multiply the project budget.
The fixture admits at most 10 tenant labels and 100 seats. Labels are not verified human
operators or paying customers. The API rejects bodies over 4 MiB, while its strict counter
schema is much smaller. This does **not** demonstrate 1 GB uploads or production capacity.

There is no multipart/presigned upload API. No automatic monthly resets, seven-day retention
scheduler, complete account deletion, backup purge, per-seat D1/index-size measurement,
WAL quota, operator MFA, production audit system or Stripe webhook handling is implemented.
The local page-count guard closes object creation at 70% of a configurable database ceiling;
it is not a D1 shard-capacity controller. Quotas close on an expired accounting period rather
than silently resetting. Operator reconciliation is still needed for period rollover.

The local transaction holds a synchronous SQLite lock across filesystem changes to fence
late writers. D1 transactions cannot be held open across R2 network operations this way.
A production D1/R2 adapter requires a separately designed and tested asynchronous reservation,
object verification, finalize and cleanup protocol. Do not copy this harness into a Worker.
The intended production stack remains the existing Workers + D1, with gated private R2,
Queues notification delivery and a separately authorized independent backup provider.

See CURRENT_STATE.md, SAFETY_AND_RUNBOOKS.md, TRACEABILITY.md, openapi.json and
manifest.schema.json. **Live/pilot decision: NO-GO.** Local code and tests do not close
legal, security, independent recovery, infrastructure or payment-integration gates.
