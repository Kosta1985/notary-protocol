// Shared, bounded same-origin requests for public UI and explicit forms.
// The lookup functions below only check existing records; they never create proofs,
// orders, payments, Passports, enrollments or commissions.
export class EvidenceError extends Error {
  constructor(code, status = 0) { super(code); this.name = 'EvidenceError'; this.code = code; this.status = status; }
}
const object = value => Boolean(value && typeof value === 'object' && !Array.isArray(value));
const referencePattern = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,199}$/;
export function classifyReference(value) {
  const id = String(value ?? '').trim();
  if (/^(?:sk_|rk_|whsec_|at_test_|at_live_)/.test(id)) throw new EvidenceError('invalid_reference');
  if (!referencePattern.test(id)) throw new EvidenceError('invalid_reference');
  if (id.startsWith('agtp_')) {
    if (!/^agtp_[a-f0-9]{64}$/.test(id)) throw new EvidenceError('invalid_passport');
    return { kind: 'passport', id };
  }
  if (id.startsWith('atpc_')) {
    if (!/^atpc_[a-f0-9]{32}$/.test(id)) throw new EvidenceError('invalid_reference');
    return { kind: 'certificate', id };
  }
  if (id.startsWith('atp_')) {
    if (!/^atp_[a-f0-9]{32}$/.test(id)) throw new EvidenceError('invalid_reference');
    return { kind: 'proof', id };
  }
  if (id.startsWith('ntr_')) {
    if (!/^ntr_[a-f0-9]{24}$/.test(id)) throw new EvidenceError('invalid_reference');
    return { kind: 'receipt', id };
  }
  if (/^(atr_|atpo_|stpo_)/.test(id)) throw new EvidenceError('not_evidence_reference');
  return { kind: 'validation', id };
}

// Limit decoded response bytes even if Content-Length is missing, compressed or wrong.
// No response body (including errors and optional 404s) is left unread and active.
const MAX_RESPONSE_BYTES = 1_048_576;
function discardResponse(response) {
  if (response?.body && !response.body.locked) void response.body.cancel().catch(() => {});
}
function validateResponseComplexity(value) {
  const stack = [{ value, depth: 0 }];
  let nodes = 0;
  while (stack.length) {
    const item = stack.pop();
    if (++nodes > 100_000 || item.depth > 128) throw new EvidenceError('response_too_complex');
    if (typeof item.value === 'number' && !Number.isFinite(item.value)) throw new EvidenceError('invalid_response');
    if (item.value !== null && typeof item.value === 'object') {
      const keys = Object.keys(item.value);
      if (nodes + stack.length + keys.length > 100_000) throw new EvidenceError('response_too_complex');
      for (const key of keys) stack.push({ value: item.value[key], depth: item.depth + 1 });
    }
  }
}
async function readResponseJson(response, signal) {
  const declared = response.headers.get('content-length');
  if (declared && /^\d+$/.test(declared) && Number(declared) > MAX_RESPONSE_BYTES) throw new EvidenceError('response_too_large');
  if (!response.body) throw new EvidenceError('invalid_response');
  const reader = response.body.getReader();
  const chunks = [];
  let size = 0, complete = false;
  const cancel = () => { void reader.cancel().catch(() => {}); };
  signal.addEventListener('abort', cancel, { once: true });
  try {
    for (;;) {
      if (signal.aborted) throw new EvidenceError('cancelled');
      const { done, value } = await reader.read();
      if (signal.aborted) throw new EvidenceError('cancelled');
      if (done) { complete = true; break; }
      size += value.byteLength;
      if (size > MAX_RESPONSE_BYTES) throw new EvidenceError('response_too_large');
      chunks.push(value);
    }
  } finally {
    signal.removeEventListener('abort', cancel);
    if (!complete) cancel();
    reader.releaseLock();
  }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
  let value;
  try { value = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes)); }
  catch { throw new EvidenceError('invalid_response'); }
  validateResponseComplexity(value);
  return value;
}

export async function requestJson(path, { signal, body, optional = false, acceptInvalid = false, timeoutMs = 10000, headers = {}, fetchImpl = globalThis.fetch } = {}) {
  if (typeof path !== 'string' || !/^\/(?:api\/v1\/|v1\/)/.test(path) || /[\\\r\n]/.test(path)) throw new EvidenceError('invalid_endpoint');
  const normalized = new URL(path, 'https://accordtrace.invalid');
  if (normalized.origin !== 'https://accordtrace.invalid' || !/^\/(?:api\/v1\/|v1\/)/.test(normalized.pathname)) throw new EvidenceError('invalid_endpoint');
  if (signal?.aborted) throw new EvidenceError('cancelled');
  const controller = new AbortController();
  let timedOut = false, response;
  const abort = () => controller.abort();
  signal?.addEventListener('abort', abort, { once: true });
  const timer = setTimeout(() => { timedOut = true; controller.abort(); }, timeoutMs);
  try {
    response = await fetchImpl(path, {
      method: body === undefined ? 'GET' : 'POST',
      headers: { accept: 'application/json', ...(body === undefined ? {} : { 'content-type': 'application/json' }), ...headers },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      signal: controller.signal, cache: 'no-store', redirect: 'error', credentials: 'omit'
    });
    if (controller.signal.aborted) throw new EvidenceError('cancelled');
    if (optional && response.status === 404) return null;
    if (!response.ok && !(acceptInvalid && response.status === 422)) throw new EvidenceError(response.status === 404 ? 'not_found' : response.status === 429 ? 'rate_limited' : response.status >= 500 ? 'unavailable' : 'request_rejected', response.status);
    if (!/^application\/(?:[a-z0-9.+-]+\+)?json(?:\s*;|$)/i.test(response.headers.get('content-type') || '')) throw new EvidenceError('invalid_response');
    const value = await readResponseJson(response, controller.signal);
    if (controller.signal.aborted) throw new EvidenceError('cancelled');
    if (!object(value) || Object.prototype.hasOwnProperty.call(value, 'error')) throw new EvidenceError('invalid_response');
    if (response.status === 422 && value.valid !== false) throw new EvidenceError('invalid_response');
    return value;
  } catch (error) {
    if (signal?.aborted) throw new EvidenceError('cancelled');
    if (timedOut) throw new EvidenceError('timeout');
    if (error instanceof EvidenceError) throw error;
    throw new EvidenceError('network');
  } finally {
    discardResponse(response);
    clearTimeout(timer);
    signal?.removeEventListener('abort', abort);
  }
}

export function publicErrorMessage(error) {
  const messages = {
    invalid_reference: 'Enter an AccordTrace evidence ID, not a URL or private key.',
    invalid_passport: 'Enter a full Agent Passport ID: agtp_ followed by 64 hexadecimal characters.',
    not_evidence_reference: 'Referral codes and order IDs are not evidence IDs. Use a Passport, proof, Certificate or validation request ID.',
    not_found: 'No matching public evidence was found. Check the ID and try again.',
    response_too_large: 'The response exceeds the safe display limit. Evidence could not be confirmed.',
    response_too_complex: 'The response exceeds the supported data complexity. Evidence could not be confirmed.',
    invalid_response: 'The service returned an incomplete or unexpected response. Evidence could not be confirmed.',
    unavailable: 'The evidence service is temporarily unavailable. Please try again.',
    rate_limited: 'Too many requests. Please wait before trying again.',
    timeout: 'The request timed out. No verification result was confirmed. Please retry.',
    network: 'The service could not be reached. Check your connection and retry.',
    cancelled: 'The previous request was cancelled.',
    request_rejected: 'The evidence request could not be accepted. Check the reference and try again.'
  };
  return messages[error?.code] || 'Evidence could not be confirmed. Please retry.';
}

export async function loadPassportEvidence(id, options = {}) {
  if (classifyReference(id).kind !== 'passport') throw new EvidenceError('invalid_passport');
  const primary = await requestJson(`/api/v1/security/passports/${encodeURIComponent(id)}`, options);
  if (!object(primary.passport) || primary.passport.id !== id || typeof primary.passport.status !== 'string') throw new EvidenceError('invalid_response');
  const endpoints = [
    ['validation', `/api/v1/validation/passports/${id}/evidence`],
    ['reputation', `/api/v1/reputation/passports/${id}/graph-signals`],
    ['identity', `/api/v1/identity/passports/${id}/evidence`],
    ['affiliate_network', `/api/v1/network/passports/${id}/summary`],
    ['passport_certificate', `/api/v1/passport-product/passports/${id}/certificate`]
  ];
  const result = { passport: primary, warnings: [] };
  await Promise.all(endpoints.map(async ([name, path]) => {
    try {
      const value = await requestJson(path, { ...options, optional: true });
      if (value && value.passport_id !== id) throw new EvidenceError('invalid_response');
      if (value && name === 'validation' && (!Array.isArray(value.validations) || value.validations.some(record => !object(record)))) throw new EvidenceError('invalid_response');
      if (value && name === 'passport_certificate' && (!object(value.certificate) || !/^atpc_[a-f0-9]{32}$/.test(value.certificate.id))) throw new EvidenceError('invalid_response');
      result[name] = value;
    } catch (error) {
      result[name] = null;
      result.warnings.push({ section: name, message: publicErrorMessage(error) });
    }
  }));
  if (options.signal?.aborted) throw new EvidenceError('cancelled');
  return result;
}

function checkedVerification(result, id, idField) {
  if (!object(result) || typeof result.valid !== 'boolean' || result[idField] !== id) throw new EvidenceError('invalid_response');
  return result;
}
export async function lookupEvidence(reference, options = {}) {
  const { kind, id } = classifyReference(reference);
  if (kind === 'passport') {
    const data = await loadPassportEvidence(id, options);
    return { kind, id, title: `Passport record: ${data.passport.passport.status}`, outcome: 'record', description: 'This is the current public Passport record, not a new proof of possession or a general trust rating.', data };
  }
  if (kind === 'proof') {
    const verification = checkedVerification(await requestJson('/api/v1/verify', { ...options, body: { proof_id: id } }), id, 'proof_id');
    const signed = verification.integrity_mode === 'issuer_signed_hash';
    if (verification.valid && (signed ? verification.signature_valid !== true : verification.integrity_mode !== 'service_recorded_hash' || verification.signature_valid !== null)) throw new EvidenceError('invalid_response');
    return { kind, id, title: !verification.valid ? 'Proof verification failed' : signed ? 'Proof signature verified' : 'Service record found - no issuer signature', outcome: !verification.valid ? 'invalid' : signed ? 'verified' : 'record', description: 'No original content was supplied, so this check does not compare the underlying document. ' + String(verification.limitations || ''), data: verification };
  }
  if (kind === 'receipt') {
    const receipt = await requestJson(`/v1/receipts/${id}`, options);
    if (receipt.id !== id || !object(receipt.notary)) throw new EvidenceError('invalid_response');
    const verification = checkedVerification(await requestJson('/v1/receipts/verify', { ...options, body: receipt, acceptInvalid: true }), id, 'receiptId');
    return { kind, id, title: verification.valid ? 'Receipt signature verified' : 'Receipt signature not verified', outcome: verification.valid ? 'verified' : 'invalid', description: 'A valid receipt signature authenticates the recorded result, not a positive outcome or the truth of every claim. Inspect the original result below.', data: { receipt, verification } };
  }
  if (kind === 'certificate') {
    const record = await requestJson(`/api/v1/passport-product/certificates/${id}`, options);
    if (!object(record.certificate) || record.certificate.id !== id || typeof record.state !== 'string') throw new EvidenceError('invalid_response');
    const verification = checkedVerification(await requestJson('/api/v1/passport-product/certificates/verify', { ...options, body: { certificate: record.certificate }, acceptInvalid: true }), id, 'certificate_id');
    const active = record.state === 'active';
    return { kind, id, title: !verification.valid ? 'Certificate signature not verified' : active ? 'Certificate signature verified - active' : `Historical signature verified - ${record.state}`, outcome: !verification.valid ? 'invalid' : active ? 'verified' : 'record', description: 'The signature records historical issuance. Current Certificate state is reported separately; neither proves legal identity, KYC, safety or general trust.', data: { ...record, verification } };
  }
  const record = await requestJson(`/api/v1/validation/requests/${encodeURIComponent(id)}`, options);
  if (!object(record.validation_request) || record.validation_request.id !== id || typeof record.validation_request.status !== 'string') throw new EvidenceError('invalid_response');
  return { kind, id, title: `Validation record: ${record.validation_request.status}`, outcome: 'record', description: 'The public validation record was retrieved. Retrieval alone is not an independent verification of its signature or a positive assessment outcome.', data: record };
}

export function safeLocalLink(value, origin = globalThis.location?.origin) {
  if (typeof value !== 'string' || !value.trim()) return null;
  try {
    const url = new URL(value, origin);
    if (!origin || url.origin !== origin || !['https:', 'http:'].includes(url.protocol) || url.username || url.password) return null;
    return url.pathname + url.search + url.hash;
  } catch { return null; }
}
