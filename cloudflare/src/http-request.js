export class InputError extends Error {
  constructor(message, status = 400) { super(message); this.status = status; }
}
// Bound reads while streaming, not only after allocating the entire body.
export async function readJsonBody(request, { maxBytes = 1_048_576, requireObject = true } = {}) {
  const declared = request.headers.get('content-length');
  if (declared && /^\d+$/.test(declared) && Number(declared) > maxBytes) throw new InputError('Request body exceeds 1 MiB', 413);
  if (!request.body) throw new InputError('Request body must be valid JSON');
  const reader = request.body.getReader();
  const chunks = [];
  let size = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > maxBytes) { void reader.cancel().catch(() => {}); throw new InputError('Request body exceeds 1 MiB', 413); }
      chunks.push(value);
    }
  } finally { reader.releaseLock(); }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
  let body;
  try { body = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes)); }
  catch { throw new InputError('Request body must be valid UTF-8 JSON'); }
  if (requireObject && (!body || typeof body !== 'object' || Array.isArray(body))) throw new InputError('Request body must be a JSON object');
  return body;
}
