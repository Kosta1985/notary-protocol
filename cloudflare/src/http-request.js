export class InputError extends Error {
  constructor(message, status = 400) { super(message); this.status = status; }
}
// Bound reads while streaming, not only after allocating the entire body.
export async function readJsonBody(request, { maxBytes = 1_048_576, requireObject = true, maxDepth = 128, maxNodes = 100_000 } = {}) {
  const declared = request.headers.get('content-length');
  if (declared && /^\d+$/.test(declared) && Number(declared) > maxBytes) throw new InputError(`Request body exceeds ${maxBytes} bytes`, 413);
  if (!request.body) throw new InputError('Request body must be valid JSON');
  const reader = request.body.getReader();
  const chunks = [];
  let size = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > maxBytes) { void reader.cancel().catch(() => {}); throw new InputError(`Request body exceeds ${maxBytes} bytes`, 413); }
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
  assertJsonComplexity(body, { maxDepth, maxNodes });
  return body;
}

// Check shape iteratively before recursive canonicalizers/signers see input.
// This does not modify values, property order, numbers or signature bytes.
export function assertJsonComplexity(value, { maxDepth = 128, maxNodes = 100_000 } = {}) {
  const stack = [{ value, depth: 0 }];
  let nodes = 0;
  while (stack.length) {
    const item = stack.pop();
    if (++nodes > maxNodes) throw new InputError('JSON node count exceeds the supported limit', 413);
    if (item.depth > maxDepth) throw new InputError('JSON nesting exceeds the supported limit', 413);
    if (item.value !== null && typeof item.value === 'object') {
      const keys = Object.keys(item.value);
      if (nodes + stack.length + keys.length > maxNodes) throw new InputError('JSON node count exceeds the supported limit', 413);
      for (const key of keys) stack.push({ value: item.value[key], depth: item.depth + 1 });
    }
  }
}
