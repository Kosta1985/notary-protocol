import { EvidenceError } from './public-evidence.js';

// A responding HTTP server is not enough to claim that a specific API is ready.
// These checks describe only the public capability document, never a transaction.
export const capabilityProbes = [
  { path: '/api/v1/security/capabilities', name: 'Passport & Security', service: 'AccordTrace Agent Security & Trust', feature: 'cryptographic_agent_passport' },
  { path: '/api/v1/validation/capabilities', name: 'Validation Marketplace', service: 'AccordTrace Validation Marketplace', feature: 'public_validation_evidence' },
  { path: '/api/v1/payments/capabilities', name: 'Payments', service: 'AccordTrace Non-Custodial Payments', feature: 'signed_service_offers' },
  { path: '/api/v1/passport-product/capabilities', name: 'Passport Certificate', service: 'AccordTrace Agent Passport Certificate' }
];
const object = value => Boolean(value && typeof value === 'object' && !Array.isArray(value));
export function describeCapability(probe, body) {
  if (!object(body) || body.service !== probe.service || typeof body.version !== 'string' || !body.version.trim() || body.version.length > 80) throw new EvidenceError('invalid_response');
  if (probe.feature) {
    if (!Array.isArray(body.features) || body.features.length > 100 || !body.features.every(v => typeof v === 'string') || !body.features.includes(probe.feature)) throw new EvidenceError('invalid_response');
    return 'The expected public capabilities document responded. Individual operations may still be disabled; this is not a completed-operation test.';
  }
  const names = ['checkout_enabled', 'webhook_enabled', 'certificate_signing_enabled', 'checkout_activation_enabled', 'referral_pricing_consistent', 'commercial_ready', 'cash_affiliate_payouts_enabled'];
  if (names.some(name => typeof body[name] !== 'boolean') || body.product?.id !== 'agent_passport_certificate') throw new EvidenceError('invalid_response');
  if (body.commercial_ready && !names.slice(0, 5).every(name => body[name])) throw new EvidenceError('invalid_response');
  return body.commercial_ready
    ? 'Checkout prerequisites are configured. This capability document does not confirm a completed payment or Certificate issuance.'
    : 'Certificate purchases are not currently enabled. ' + (body.certificate_signing_enabled ? 'Issuer signing is configured; checkout remains on hold.' : 'Issuer signing is not ready.');
}
