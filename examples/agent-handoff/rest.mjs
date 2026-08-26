import { baseUrl, createEvidence, createProof, printResult, verifyRest } from "./lib.mjs";

const evidence = createEvidence("rest-example");
const proof = await createProof(evidence, "rest-example");
const verification = await verifyRest(proof.proof_id, evidence);

printResult({
  interface: "REST",
  service: baseUrl,
  proof_id: proof.proof_id,
  handoff_id: evidence.handoff_id,
  valid: verification.valid,
  hash_match: verification.hash_match
});
