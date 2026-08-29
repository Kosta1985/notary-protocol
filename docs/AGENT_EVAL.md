# Accord Trace Agent Interoperability Eval

A small public evaluation that any agent builder can reproduce.

## Objective

Measure whether two independent clients can create and verify the same evidence across different Accord Trace interfaces.

## Test evidence

Use synthetic data only, for example:

```json
{
  "workflow": "accordtrace-public-eval",
  "step": "handoff",
  "status": "complete",
  "artifact_sha256": "synthetic-example"
}
```

## Pass criteria

- Client A can discover Accord Trace without private documentation.
- Client A creates a proof and receives a stable proof ID.
- Client B retrieves/verifies that proof.
- Exact evidence verifies successfully.
- Mutated evidence does not verify as the original evidence.
- The clients can use different interfaces where supported.

## Matrix

Try at least one pair:

- MCP create -> REST verify
- REST create -> A2A verify
- A2A create -> REST verify
- OpenAPI-driven create -> MCP verify

## Report template

```text
Client/framework A:
Client/framework B:
Create interface:
Verify interface:
Discovery succeeded: yes/no
Proof created: yes/no
Exact evidence verified: yes/no
Mutated evidence rejected: yes/no
Friction or error:
```

Post reproducible failures or successful interoperability results to the repository. Successful results are not treated as endorsements unless the tester explicitly says they may be quoted as such.
