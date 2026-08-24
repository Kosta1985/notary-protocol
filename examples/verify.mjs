const baseUrl = process.env.NOTARY_URL ?? "https://notary-protocol.notary-labs.workers.dev";

const envelope = await fetch(`${baseUrl}/v1/demo`).then((response) => response.json());
const response = await fetch(`${baseUrl}/v1/verify`, {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify(envelope)
});
const receipt = await response.json();

console.log(JSON.stringify({ receiptId: receipt.id, valid: receipt.valid, checks: receipt.checks.length, violations: receipt.violations }, null, 2));
if (!receipt.valid) process.exitCode = 1;
