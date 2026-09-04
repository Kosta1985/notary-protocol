import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { hashData } from "../src/proofs.js";

const wrangler = fs.readFileSync(new URL("../../wrangler.jsonc", import.meta.url), "utf8");
const entry = fs.readFileSync(new URL("../src/worker-v2.js", import.meta.url), "utf8");
const interoperability = fs.readFileSync(new URL("../src/interoperability.js", import.meta.url), "utf8");
const proofs = fs.readFileSync(new URL("../src/proofs.js", import.meta.url), "utf8");
const live = fs.readFileSync(new URL("../../scripts/live-agent-check.mjs", import.meta.url), "utf8");
const card = JSON.parse(fs.readFileSync(new URL("../../web/.well-known/agent.json", import.meta.url), "utf8"));
const mcpManifest = JSON.parse(fs.readFileSync(new URL("../../web/.well-known/mcp.json", import.meta.url), "utf8"));
const openapiFragment = JSON.parse(fs.readFileSync(new URL("../../docs/openapi-fragments/proofs-interoperability.json", import.meta.url), "utf8"));

test("production entrypoint routes modern interoperability before legacy runtime", () => {
  assert.match(wrangler, /cloudflare\/src\/worker-v2\.js/);
  for (const route of ["/mcp", "/a2a", "/api/v1/proofs*", "/api/v1/hash", "/api/v1/verify", "/.well-known/*"]) assert.ok(wrangler.includes(`\"${route}\"`));
  assert.match(entry, /handleInteroperability/);
  assert.match(entry, /handleProofs/);
  assert.ok(entry.indexOf("handleInteroperability") < entry.indexOf("coreWorker.fetch"));
});

test("A2A discovery and live checker agree on Accord Trace v1.0", () => {
  assert.equal(card.name, "Accord Trace");
  assert.equal(card.supportedInterfaces?.[0]?.protocolVersion, "1.0");
  assert.ok(card.skills?.some((skill) => skill.id === "notarize_evidence"));
  assert.match(interoperability, /TASK_STATE_COMPLETED/);
  assert.match(interoperability, /verify_proof/);
  assert.match(live, /protocolVersion, "1\.0"/);
});

test("remote MCP manifest runtime and live checker share one protocol contract", () => {
  assert.equal(mcpManifest.url, "https://accordtrace.notary-labs.workers.dev/mcp");
  assert.equal(mcpManifest.transport, "streamable-http");
  assert.match(interoperability, /2026-07-28/);
  assert.match(interoperability, /accord_trace_verify/);
  assert.match(live, /accord_trace_verify/);
  assert.match(live, /2026-07-28/);
});

test("proof API is real documented and issuer signed", () => {
  for (const path of ["/api/v1/proofs", "/api/v1/proofs/{proof_id}", "/api/v1/verify", "/api/v1/hash", "/mcp"]) assert.ok(openapiFragment.paths[path]);
  assert.match(proofs, /accordtrace\.proof\.v1/);
  assert.match(proofs, /Ed25519/);
  assert.match(proofs, /INSERT INTO receipts/);
  assert.match(proofs, /data is not stored|metadata/i);
});

test("canonical hash is stable across object key order", async () => {
  const a = await hashData({ b: 2, a: { y: true, x: [1, "z"] } });
  const b = await hashData({ a: { x: [1, "z"], y: true }, b: 2 });
  const c = await hashData({ a: { x: [1, "different"], y: true }, b: 2 });
  assert.match(a, /^sha256:[a-f0-9]{64}$/);
  assert.equal(a, b);
  assert.notEqual(a, c);
});
