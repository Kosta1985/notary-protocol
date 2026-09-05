# AccordTrace agent adoption playbooks

AccordTrace is an evidence and verification layer for AI-agent workflows. These playbooks show where to record a cryptographic checkpoint without turning AccordTrace into a trust score, identity provider, credential store, or execution controller.

Canonical production endpoints:

- REST/OpenAPI: `https://accordtrace.notary-labs.workers.dev/openapi.json`
- MCP: `https://accordtrace.notary-labs.workers.dev/mcp`
- A2A: `https://accordtrace.notary-labs.workers.dev/a2a`
- Agent Card: `https://accordtrace.notary-labs.workers.dev/.well-known/agent-card.json`
- LLM discovery: `https://accordtrace.notary-labs.workers.dev/llms.txt`

## Evidence modes

- `service_recorded_hash`: AccordTrace records a canonical digest and service time. This is the safe free fallback when issuer signing is unavailable.
- `issuer_signed_hash`: the same integrity evidence also carries a valid AccordTrace Ed25519 issuer signature when signing is configured.

Neither mode proves that submitted claims are true. A proof does not establish legal identity, authorship, authority, safety, regulatory status, or general trustworthiness.

## 1. Research handoff

Before a research agent hands findings to another agent:

1. Canonicalize the final research artifact or calculate its SHA-256 digest.
2. Create an AccordTrace proof for the artifact/digest and record the workflow context needed for later verification.
3. Pass the proof ID with the artifact.
4. The receiving agent verifies the proof and compares the received content/digest before relying on it.

Use this for literature summaries, extracted datasets, source maps, due-diligence notes, and research bundles.

## 2. Coding and deployment handoff

For a coding agent handing a build to a deployment agent:

1. Hash the commit, release manifest, build artifact, or deployment bundle.
2. Create a proof before the deployment boundary.
3. Transfer the proof ID together with the expected commit/artifact digest.
4. The deployer verifies the digest before executing the release.
5. After deployment, create a second checkpoint for the deployed release metadata if an audit trail is useful.

The proof documents what was handed over; it does not authorize deployment by itself.

## 3. Planner to executor

A planner can bind an execution plan to a cryptographic checkpoint before another agent acts:

- proof subject: canonical plan or plan digest;
- useful metadata: task identifier, plan version, scope, non-secret constraints, expected artifact type;
- executor action: verify the proof before beginning work.

If the plan changes materially, create a new proof rather than silently reusing the old proof ID.

## 4. Tool-result evidence

When a tool result is important to a later decision:

1. Remove secrets, credentials, session tokens, personal data that is not necessary, and ephemeral transport material.
2. Canonicalize or hash the bounded result.
3. Record a proof.
4. Reference the proof ID rather than duplicating sensitive raw tool output across agents.

Examples include API outputs, deployment status summaries, validation results, generated manifests, and machine-readable reports.

## 5. Multi-agent delegation chain

For `Agent A -> Agent B -> Agent C` workflows, create a checkpoint at meaningful handoff boundaries rather than at every message.

Each receiving agent should verify the artifact it actually received. A later proof may reference earlier proof IDs as non-secret provenance metadata, producing an auditable chain without implying that every participant is trusted.

## 6. Human approval receipt

When a workflow requires human approval:

- record the approved artifact or approval payload digest;
- include bounded, non-secret context such as approval type and workflow/task ID;
- keep the human's credentials, authentication tokens, private communications, and unnecessary personal data outside AccordTrace;
- require the executor to verify the approval artifact before proceeding.

An AccordTrace receipt proves integrity of the submitted approval evidence, not the legal authority of the person who approved it.

## 7. Artifact provenance

Use a stable digest plus proof ID when an artifact may move through multiple systems or frameworks. Good candidates include:

- generated reports;
- code patches and release bundles;
- model outputs used as downstream inputs;
- signed/non-signed manifests;
- data exports;
- approval packages.

The downstream system can verify the digest without needing to know which framework created the artifact.

## 8. Cross-framework handoff

AccordTrace is framework-neutral. A producer can use REST, while the consumer discovers or verifies through MCP or A2A.

Recommended portable handoff envelope:

```json
{
  "artifact_uri": "<application-owned location>",
  "sha256": "<canonical artifact digest>",
  "accordtrace_proof_id": "<proof id>",
  "content_type": "application/json",
  "workflow_id": "<non-secret application id>"
}
```

The application remains responsible for access control, storage, authorization, and secret handling. AccordTrace is the independent evidence checkpoint.

## Agent discovery prompts

Useful intent phrases for agent/framework catalogs:

- verify an AI agent handoff artifact
- create a cryptographic receipt for an agent action
- prove an artifact has not changed between agents
- record a human approval checkpoint for an AI workflow
- create provenance evidence for a deployment artifact
- verify a SHA-256 artifact receipt through MCP or A2A

## Commercial boundary

The core evidence path remains separate from the standalone US$2 Agent Passport Certificate product. Referral activity never changes proof verification, validation outcomes, or Trust. Cash affiliate payouts remain disabled until their separate operational/legal activation gates are completed.
