import assert from 'node:assert/strict';
import { pathToFileURL } from 'node:url';
import { requestJson, publicErrorMessage } from '../../web/public-evidence.js';
export const CAMPAIGN = 'handoff_beta_20260905';
const sources = ['github', 'website', 'linkedin', 'x', 'community', 'partner', 'direct'];
// Explicit execution creates ONE synthetic public proof and verifies it twice.
// Importing this module does not make requests. It never creates a payment/lead.
export async function runChallenge({ base = 'https://accordtrace.notary-labs.workers.dev', source = 'direct', fetchImpl = globalThis.fetch } = {}) {
  const url = new URL(base);
  assert.ok(url.protocol === 'https:' && !url.username && !url.password && !url.search && !url.hash && url.pathname === '/', 'Use a plain HTTPS service origin');
  source = sources.includes(source) ? source : 'direct';
  const evidence = { event: 'agent.handoff', handoff_id: crypto.randomUUID(), artifact: 'synthetic-demo', revision: 1 };
  const options = { timeoutMs: 10000, fetchImpl: (path, init) => fetchImpl(url.origin + path, init) };
  const proof = await requestJson('/api/v1/proofs', { ...options, body: { data: evidence, metadata: { synthetic: true, campaign: CAMPAIGN, source, scope: 'single-client-demo' } } });
  assert.match(String(proof.proof_id || ''), /^atp_[a-f0-9]{32}$/, 'Missing proof ID');
  const exact = await requestJson('/api/v1/verify', { ...options, body: { proof_id: proof.proof_id, data: evidence } });
  assert.equal(exact.proof_id, proof.proof_id); assert.equal(exact.valid, true); assert.equal(exact.hash_match, true);
  assert.ok(exact.integrity_mode === 'issuer_signed_hash' && exact.signature_valid === true || exact.integrity_mode === 'service_recorded_hash' && exact.signature_valid === null, 'Signature mode not confirmed');
  const changed = await requestJson('/api/v1/verify', { ...options, body: { proof_id: proof.proof_id, data: { ...evidence, revision: 2 } } });
  assert.equal(changed.proof_id, proof.proof_id); assert.equal(changed.valid, false, 'Changed evidence incorrectly accepted'); assert.equal(changed.hash_match, false);
  return { campaign: CAMPAIGN, source, scope: 'single-client synthetic test; not an independent adoption report', proof_id: proof.proof_id, evidence, exact_evidence_verified: true, changed_evidence_rejected: true, integrity_mode: exact.integrity_mode, signature_valid: exact.signature_valid, record_url: `${url.origin}/api/v1/proofs/${proof.proof_id}`, verification_page: `${url.origin}/verify.html`, next_step: 'Use a second client and share the actual result on GitHub issue #17. Never include secrets or personal data.', limitation: 'Integrity is not proof of truth, authorship, identity, safety or payment.' };
}
if (process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url) {
  const args = process.argv.slice(2);
  if (args.length && !(args.length === 2 && args[0] === '--source' && sources.includes(args[1]))) {
    console.error('Use no arguments or --source github|website|linkedin|x|community|partner|direct'); process.exitCode = 1;
  } else {
    try { console.log(JSON.stringify(await runChallenge({ base: process.env.ACCORD_TRACE_URL || undefined, source: args[1] || 'direct' }), null, 2)); }
    catch (error) { console.error(`Challenge not confirmed: ${error?.code ? publicErrorMessage(error) : 'A response or evidence check did not meet the expected contract.'}`); process.exitCode = 1; }
  }
}
