import test from 'node:test';
import assert from 'node:assert/strict';
import { capabilityProbes, describeCapability } from '../web/dashboard-data.js';
const invalid = error => error.code === 'invalid_response';
const product = () => ({ service: capabilityProbes[3].service, version: '0.1.0', product: { id: 'agent_passport_certificate' }, checkout_enabled: true, webhook_enabled: true, certificate_signing_enabled: true, checkout_activation_enabled: false, referral_pricing_consistent: true, commercial_ready: false, cash_affiliate_payouts_enabled: false });

test('empty or unrelated HTTP-200 capability documents are not API success', () => {
  for (const probe of capabilityProbes) for (const body of [{}, null, [], { service: 'unrelated', version: '1' }]) assert.throws(() => describeCapability(probe, body), invalid);
});
test('expected service and actual feature are required on generic capability cards', () => {
  for (const probe of capabilityProbes.slice(0, 3)) {
    const body = { service: probe.service, version: '0.1.0', features: [probe.feature] };
    assert.match(describeCapability(probe, body), /may still be disabled/);
    assert.throws(() => describeCapability(probe, { ...body, features: [] }), invalid);
    assert.throws(() => describeCapability(probe, { ...body, features: [probe.feature, {}] }), invalid);
  }
});
test('configured issuer is not confused with enabled sales', () => {
  assert.match(describeCapability(capabilityProbes[3], product()), /checkout remains on hold/);
});
test('contradictory readiness and string booleans never produce a ready capability card', () => {
  assert.throws(() => describeCapability(capabilityProbes[3], { ...product(), commercial_ready: true }), invalid);
  assert.throws(() => describeCapability(capabilityProbes[3], { ...product(), commercial_ready: 'true' }), invalid);
  assert.throws(() => describeCapability(capabilityProbes[3], { ...product(), product: { id: 'validation' } }), invalid);
});
test('missing or unbounded versions do not identify an expected capability document', () => {
  for (const version of [undefined, '', ' ', 1, 'v'.repeat(81)]) assert.throws(() => describeCapability(capabilityProbes[3], { ...product(), version }), invalid);
});
test('fully configured capability still does not claim a completed transaction', () => {
  assert.match(describeCapability(capabilityProbes[3], { ...product(), checkout_activation_enabled: true, commercial_ready: true }), /does not confirm a completed payment/);
});
