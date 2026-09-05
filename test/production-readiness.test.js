import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const ready = fs.readFileSync(new URL('../scripts/production-readiness.mjs', import.meta.url), 'utf8');
const smoke = fs.readFileSync(new URL('../scripts/full-production-smoke.js', import.meta.url), 'utf8');
const deploy = fs.readFileSync(new URL('../.github/workflows/deploy-accordtrace.yml', import.meta.url), 'utf8');
const liveSmoke = fs.readFileSync(new URL('../.github/workflows/live-smoke.yml', import.meta.url), 'utf8');
const secondarySmoke = fs.readFileSync(new URL('../.github/workflows/accord-trace-agent-smoke.yml', import.meta.url), 'utf8');
const launch = fs.readFileSync(new URL('../cloudflare/src/launch.js', import.meta.url), 'utf8');
const wrangler = fs.readFileSync(new URL('../wrangler.jsonc', import.meta.url), 'utf8');

test('readiness validator requires contiguous migrations and current commercial assets', () => {
  assert.match(ready, /migration_sequence/);
  assert.match(ready, /expected_at_least_21/);
  for (const marker of [
    'web/passport.html',
    'web/passport.js',
    'web/verify.html',
    'web/developers.html',
    'web/checkout-success.html',
    'web/passport-checkout-success.html',
    'web/network.html',
    'handleAgentContinuity',
    'runContinuityScheduled',
    'handleAffiliate',
    'matureAffiliateCommissions'
  ]) assert.ok(ready.includes(marker));
});

test('readiness locks the US$2 Passport and US$1 one-level referral launch contract', () => {
  for (const marker of [
    'agent_passport_certificate',
    'price_atomic: 200',
    'direct_commission_atomic: 100',
    'referral_levels: 1',
    'Sample Agent Passport Certificate',
    'checkout remains fail-closed',
    'No downline',
    'Cash payout rail is not yet enabled',
    '/passport.html'
  ]) assert.ok(ready.includes(marker));
});

test('readiness v2 locks production runtime topology and protocol discovery together', () => {
  for (const marker of [
    'cloudflare/src/worker-v2.js',
    'cloudflare/src/interoperability.js',
    'cloudflare/src/proofs.js',
    'web/.well-known/agent.json',
    'web/.well-known/mcp.json',
    "wrangler_main_invalid",
    "agent_card_a2a_version_invalid",
    "mcp_transport_invalid",
    "mcp_registry_identity_invalid",
    "worker_first_route_missing",
    "service_recorded_hash",
    "issuer_signed_hash"
  ]) assert.ok(ready.includes(marker));
  for (const route of ['/mcp', '/a2a', '/api/v1/proofs*', '/api/v1/hash', '/api/v1/verify', '/.well-known/*']) assert.ok(ready.includes(route));
});

test('readiness keeps commercial activation fail-closed and observable', () => {
  for (const marker of [
    'STRIPE_PRICE_AGENT_PASSPORT',
    'STRIPE_WEBHOOK_SECRET',
    'NOTARY_PRIVATE_JWK',
    'Affiliate cash payouts remain intentionally disabled',
    'Agent Passport Certificate checkout remains disabled',
    'service_recorded_hash'
  ]) assert.ok(ready.includes(marker));
});

test('production smoke covers commercial, trust, continuity and affiliate surfaces', () => {
  for (const marker of [
    '/api/v1/security/capabilities',
    '/api/v1/payments/capabilities',
    '/api/v1/validation/capabilities',
    '/api/v1/reputation/capabilities',
    '/api/v1/continuity/capabilities',
    '/api/v1/network/capabilities',
    '/api/v1/developer/capabilities',
    '/api/v1/launch/stripe/capabilities',
    '/api/v1/launch/capabilities'
  ]) assert.ok(smoke.includes(marker));
  assert.match(smoke, /\/api\/v1\/continuity\/fleets/);
  assert.match(smoke, /\/api\/v1\/network\/capabilities/);
});

test('llms smoke preserves semantic contract without brittle capitalization', () => {
  assert.match(smoke, /const includesCI/);
  assert.match(smoke, /includesCI\(x\.text, 'No multilevel\/downline commissions'\)/);
});

test('continuity, affiliate, proof, A2A and MCP routes are Worker-first', () => {
  for (const marker of [
    '/api/v1/continuity/*',
    '/api/v1/network/*',
    '/api/v1/passport-product/*',
    '/api/v1/proofs*',
    '/api/v1/hash',
    '/api/v1/verify',
    '/a2a',
    '/mcp'
  ]) assert.ok(wrangler.includes(marker));
  assert.match(wrangler, /\*\/5 \* \* \* \*/);
  assert.match(wrangler, /cloudflare\/src\/worker-v2\.js/);
});

test('deploy stamps and verifies the exact release SHA', () => {
  assert.match(deploy, /ACCORDTRACE_RELEASE_SHA/);
  assert.match(deploy, /EXPECTED_RELEASE_SHA/);
  assert.match(deploy, /smoke:production/);
  assert.match(launch, /release_sha/);
});

test('deploy applies migrations before worker deployment', () => {
  assert.ok(deploy.indexOf('d1 migrations apply') < deploy.indexOf('wrangler@latest deploy'));
});

test('primary black-box smoke waits for successful production deploy', () => {
  assert.match(liveSmoke, /workflow_run:/);
  assert.match(liveSmoke, /Deploy AccordTrace production/);
  assert.match(liveSmoke, /workflow_run\.conclusion == 'success'/);
  assert.doesNotMatch(liveSmoke, /\npush:\s*\n/);
  assert.match(liveSmoke, /actions\/checkout@v7/);
  assert.match(liveSmoke, /actions\/setup-node@v7/);
  assert.match(liveSmoke, /live-agent-check\.mjs/);
});

test('secondary agent smoke is scheduled/manual only and cannot race push deployment', () => {
  assert.match(secondarySmoke, /schedule:/);
  assert.match(secondarySmoke, /workflow_dispatch:/);
  assert.doesNotMatch(secondarySmoke, /\npush:\s*\n/);
  assert.match(secondarySmoke, /actions\/checkout@v7/);
  assert.match(secondarySmoke, /actions\/setup-node@v7/);
});
