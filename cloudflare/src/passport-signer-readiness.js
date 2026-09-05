const BASE64URL_32 = /^[A-Za-z0-9_-]{43}$/;
const VERIFIED_STATE = Symbol('passport-signer-state');
const encoder = new TextEncoder();
let lastValidation = null;

export function inspectPassportSigningKey(raw) {
  const configured = isConfigured(raw);
  if (!configured) return { configured: false, valid: false };
  let jwk;
  try { jwk = typeof raw === 'string' ? JSON.parse(raw) : raw; } catch { return { configured: true, valid: false }; }
  const valid = Boolean(jwk && typeof jwk === 'object' && !Array.isArray(jwk)
    && jwk.kty === 'OKP' && jwk.crv === 'Ed25519'
    && typeof jwk.x === 'string' && BASE64URL_32.test(jwk.x)
    && typeof jwk.d === 'string' && BASE64URL_32.test(jwk.d));
  return { configured: true, valid };
}

// Verify a real sign/verify round trip, not merely a plausible-looking JWK.
// The existing proof signer is used only with explicit operator opt-in and only
// when NOTARY_PRIVATE_JWK is absent. Invalid primary keys never trigger fallback.
async function validate(raw, publicRaw, source) {
  const state = { configured: isConfigured(raw), valid: false, source, reason: 'missing', public_key_fingerprint: null };
  if (!state.configured) return { state, normalized: undefined };
  if (!inspectPassportSigningKey(raw).valid) return { state: { ...state, reason: 'invalid_jwk' }, normalized: undefined };
  try {
    const jwk = typeof raw === 'string' ? JSON.parse(raw) : raw;
    if (isConfigured(publicRaw)) {
      const pub = typeof publicRaw === 'string' ? JSON.parse(publicRaw) : publicRaw;
      if (!pub || pub.kty !== 'OKP' || pub.crv !== 'Ed25519' || pub.x !== jwk.x || pub.d !== undefined) {
        return { state: { ...state, reason: 'public_key_mismatch' }, normalized: undefined };
      }
    }
    const privateKey = await crypto.subtle.importKey('jwk', jwk, { name: 'Ed25519' }, false, ['sign']);
    const publicKey = await crypto.subtle.importKey('jwk', { kty: 'OKP', crv: 'Ed25519', x: jwk.x }, { name: 'Ed25519' }, true, ['verify']);
    const message = encoder.encode('accordtrace.passport-signer-readiness.v1');
    const signature = await crypto.subtle.sign('Ed25519', privateKey, message);
    if (!await crypto.subtle.verify('Ed25519', publicKey, signature, message)) throw new Error('self_test_failed');
    const spki = await crypto.subtle.exportKey('spki', publicKey);
    const digest = new Uint8Array(await crypto.subtle.digest('SHA-256', spki));
    const fingerprint = `sha256:${Array.from(digest, b => b.toString(16).padStart(2, '0')).join('')}`;
    return { state: { ...state, valid: true, reason: 'verified', public_key_fingerprint: fingerprint }, normalized: JSON.stringify(jwk) };
  } catch {
    return { state: { ...state, reason: 'key_self_test_failed' }, normalized: undefined };
  }
}

export async function passportSafeEnv(env) {
  if (env?.[VERIFIED_STATE]) return env;
  const primaryConfigured = isConfigured(env?.NOTARY_PRIVATE_JWK);
  const useProof = !primaryConfigured && String(env?.PASSPORT_USE_PROOF_SIGNER || '').toLowerCase() === 'true';
  const source = primaryConfigured ? 'NOTARY_PRIVATE_JWK' : useProof ? 'PROOF_SIGNING_PRIVATE_JWK' : null;
  const raw = source ? env?.[source] : undefined;
  const publicRaw = useProof ? env?.PROOF_SIGNING_PUBLIC_JWK : undefined;
  // Only one immutable secret-string result is retained per isolate. Rotation
  // invalidates it. Mutable object inputs are deliberately not cached.
  let promise;
  if (typeof raw === 'string' && (publicRaw === undefined || typeof publicRaw === 'string')) {
    if (!lastValidation || lastValidation.raw !== raw || lastValidation.publicRaw !== publicRaw || lastValidation.source !== source) {
      lastValidation = { raw, publicRaw, source, promise: validate(raw, publicRaw, source) };
    }
    promise = lastValidation.promise;
  } else promise = validate(raw, publicRaw, source);
  const { state, normalized } = await promise;
  const safe = Object.create(env || null);
  Object.defineProperty(safe, 'NOTARY_PRIVATE_JWK', { value: normalized, enumerable: true });
  Object.defineProperty(safe, VERIFIED_STATE, { value: Object.freeze(state) });
  return safe;
}

export function passportSignerState(env) {
  return env?.[VERIFIED_STATE] || { configured: false, valid: false, source: null, reason: 'not_checked', public_key_fingerprint: null };
}
function isConfigured(raw) {
  return raw !== undefined && raw !== null && (typeof raw !== 'string' || raw.trim() !== '');
}
