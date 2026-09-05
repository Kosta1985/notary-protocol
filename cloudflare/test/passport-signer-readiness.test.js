import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { handleInteroperability } from '../src/interoperability.js';
import { inspectPassportSigningKey, passportSafeEnv } from '../src/passport-signer-readiness.js';

const VALID_PRIVATE_JWK = JSON.stringify({
  kty: 'OKP',
  crv: 'Ed25519',
  x: 'A'.repeat(43),
  d: 'B'.repeat(43)
});

test('Passport signer readiness is fail-closed for absent and malformed JWK values', () => {
  assert.deepEqual(inspectPassportSigningKey(undefined), { configured: false, valid: false });
  assert.deepEqual(inspectPassportSigningKey(''), { configured: false, valid: false });
  assert.deepEqual(inspectPassportSigningKey('{}'), { configured: true, valid: false });
  assert.deepEqual(inspectPassportSigningKey('{bad json'), { configured: true, valid: false });
  assert.deepEqual(inspectPassportSigningKey(JSON.stringify({ kty: 'OKP', crv: 'X25519', x: 'A'.repeat(43), d: 'B'.repeat(43) })), { configured: true, valid: false });
  assert.deepEqual(inspectPassportSigningKey(JSON.stringify({ kty: 'OKP', crv: 'Ed25519', x: 'short', d: 'B'.repeat(43) })), { configured: true, valid: false });
});

test('structurally valid Ed25519 private JWK remains available to Passport routes', () => {
  assert.deepEqual(inspectPassportSigningKey(VALID_PRIVATE_JWK), { configured: true, valid: true });
  const env = { NOTARY_PRIVATE_JWK: VALID_PRIVATE_JWK, OTHER_BINDING: 'kept' };
  assert.equal(passportSafeEnv(env), env);
});

test('malformed configured signer is hidden only from Passport product consumers', () => {
  const env = { NOTARY_PRIVATE_JWK: '{}', OTHER_BINDING: 'kept' };
  const safe = passportSafeEnv(env);
  assert.notEqual(safe, env);
  assert.equal(safe.NOTARY_PRIVATE_JWK, undefined);
  assert.equal(safe.OTHER_BINDING, 'kept');
  assert.equal(env.NOTARY_PRIVATE_JWK, '{}');
});

test('MCP Passport capabilities cannot report malformed signer as commercially ready', async () => {
  const request = new Request('https://accordtrace.test/mcp', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      jsonrpc: '2.0',
      id: 'passport-readiness',
      method: 'tools/call',
      params: { name: 'accord_trace_passport_product_capabilities', arguments: {} }
    })
  });
  const env = {
    NOTARY_PRIVATE_JWK: '{}',
    STRIPE_SECRET_KEY: 'sk_test_present',
    STRIPE_PRICE_AGENT_PASSPORT: 'price_present',
    STRIPE_WEBHOOK_SECRET: 'whsec_present',
    PASSPORT_PRODUCT_PRICE_ATOMIC: '200',
    PASSPORT_PRODUCT_CURRENCY: 'usd',
    AFFILIATE_PASSPORT_PRICE_ATOMIC: '200',
    AFFILIATE_CURRENCY: 'usd'
  };

  const response = await handleInteroperability(request, env, new URL(request.url));
  assert.equal(response.status, 200);
  const body = await response.json();
  assert.equal(body.error, undefined);
  const capabilities = body.result.structuredContent;
  assert.equal(capabilities.checkout_enabled, true, 'Stripe checkout prerequisites are deliberately present in this test');
  assert.equal(capabilities.webhook_enabled, true, 'Stripe webhook prerequisite is deliberately present in this test');
  assert.equal(capabilities.referral_pricing_consistent, true);
  assert.equal(capabilities.certificate_signing_enabled, false);
  assert.equal(capabilities.commercial_ready, false);
});

test('production wrapper applies Passport-only signer sanitization before legacy product routes', () => {
  const source = fs.readFileSync(new URL('../src/worker-v2.js', import.meta.url), 'utf8');
  assert.match(source, /url\.pathname\.startsWith\("\/api\/v1\/passport-product\/"\) \? passportSafeEnv\(env\) : env/);
  assert.match(source, /handleProofs\(request, env, url\)/, 'proof path must retain original env so malformed issuer config still fails explicitly');
});
