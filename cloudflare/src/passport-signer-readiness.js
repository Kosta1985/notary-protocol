const BASE64URL_32 = /^[A-Za-z0-9_-]{43}$/;

export function inspectPassportSigningKey(raw) {
  const configured = raw !== undefined && raw !== null && (typeof raw !== "string" || raw.trim() !== "");
  if (!configured) return { configured: false, valid: false };

  let jwk = raw;
  if (typeof raw === "string") {
    try {
      jwk = JSON.parse(raw);
    } catch {
      return { configured: true, valid: false };
    }
  }

  const valid = Boolean(
    jwk
    && typeof jwk === "object"
    && !Array.isArray(jwk)
    && jwk.kty === "OKP"
    && jwk.crv === "Ed25519"
    && typeof jwk.x === "string"
    && BASE64URL_32.test(jwk.x)
    && typeof jwk.d === "string"
    && BASE64URL_32.test(jwk.d)
  );

  return { configured: true, valid };
}

export function passportSafeEnv(env) {
  const state = inspectPassportSigningKey(env?.NOTARY_PRIVATE_JWK);
  if (!state.configured || state.valid) return env;

  const safe = Object.create(env || null);
  Object.defineProperty(safe, "NOTARY_PRIVATE_JWK", {
    value: undefined,
    enumerable: true,
    configurable: false,
    writable: false
  });
  return safe;
}
