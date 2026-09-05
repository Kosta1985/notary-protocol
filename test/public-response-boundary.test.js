import test from 'node:test';
import assert from 'node:assert/strict';
import { requestJson, publicErrorMessage } from '../web/public-evidence.js';

const endpoint = '/api/v1/security/capabilities';
const encoder = new TextEncoder();
const limit = 1_048_576;
const failed = code => error => error.code === code;
function fixture(chunks, { status = 200, headers = {}, closed = true } = {}) {
  let cancelled = false;
  const stream = new ReadableStream({
    start(controller) {
      for (const part of chunks) controller.enqueue(typeof part === 'string' ? encoder.encode(part) : part);
      if (closed) controller.close();
    },
    cancel() { cancelled = true; }
  });
  const response = new Response(stream, { status, headers: { 'content-type': 'application/json', ...headers } });
  return { response, stream, cancelled: () => cancelled };
}
const read = (f, extra = {}) => requestJson(endpoint, { fetchImpl: async () => f.response, ...extra });

test('browser rejects a declared oversized response before reading it', async () => {
  const f = fixture(['{"ok":true}'], { headers: { 'content-length': String(limit + 1) } });
  await assert.rejects(read(f), failed('response_too_large'));
  assert.equal(f.cancelled(), true);
});
test('chunked response cannot evade the byte limit with an understated content length', async () => {
  const f = fixture(['{"data":"', 'a'.repeat(limit), '"}'], { headers: { 'content-length': '10' } });
  await assert.rejects(read(f), failed('response_too_large')); assert.equal(f.stream.locked, false);
});
test('exact byte limit is accepted without changing content', async () => {
  const value = { data: 'a'.repeat(limit - 11) }; const raw = JSON.stringify(value);
  assert.equal(encoder.encode(raw).length, limit);
  assert.deepEqual(await read(fixture([raw])), value);
});
test('split multibyte UTF-8 decodes without replacement or corruption', async () => {
  const data = { text: '\u20ac\ud83e\udd16' }; const bytes = encoder.encode(JSON.stringify(data));
  const chunks = [...bytes].map(byte => Uint8Array.of(byte));
  assert.deepEqual(await read(fixture(chunks)), data);
});
test('invalid UTF-8 is rejected instead of silently replacing evidence characters', async () => {
  const f = fixture([encoder.encode('{"text":"'), Uint8Array.of(0xc3, 0x28), encoder.encode('"}')]);
  await assert.rejects(read(f), failed('invalid_response'));
});
test('deep response JSON is rejected before rendering or serializing recursively', async () => {
  await assert.rejects(read(fixture(['{"data":' + '['.repeat(140) + '0' + ']'.repeat(140) + '}'])), failed('response_too_complex'));
});
test('wide response JSON has a node count bound below the byte budget', async () => {
  const raw = JSON.stringify({ data: Array(100_001).fill(0) }); assert.ok(raw.length < limit);
  await assert.rejects(read(fixture([raw])), failed('response_too_complex'));
});
test('non-finite JSON numbers never enter public evidence', async () => {
  await assert.rejects(read(fixture(['{"value":1e400}'])), failed('invalid_response'));
});
test('optional 404 discards its body rather than consuming or retaining it', async () => {
  const f = fixture(['large unused response'], { status: 404, closed: false });
  assert.equal(await read(f, { optional: true }), null); assert.equal(f.cancelled(), true);
});
test('provider error body is cancelled and never reflected in the public error', async () => {
  const f = fixture(['secret internal details'], { status: 503, closed: false });
  await assert.rejects(read(f), error => { assert.equal(error.code, 'unavailable'); assert.doesNotMatch(publicErrorMessage(error), /secret|internal details/); return true; });
  assert.equal(f.cancelled(), true);
});
test('HTML response is cancelled, not parsed as evidence', async () => {
  const f = fixture(['<html>'], { closed: false, headers: { 'content-type': 'text/html' } });
  await assert.rejects(read(f), failed('invalid_response')); assert.equal(f.cancelled(), true);
});
test('response paths containing dot-segment escapes are rejected before credentials can be sent', async () => {
  for (const path of ['/v1/../../private', '/api/v1/%2e%2e/%2e%2e/private']) {
    let called = false;
    await assert.rejects(requestJson(path, { headers: { authorization: 'Bearer fixture-not-real' }, fetchImpl: async () => { called = true; return Response.json({ ok: true }); } }), failed('invalid_endpoint'));
    assert.equal(called, false);
  }
});
test('cancelled caller cannot return a successful JSON response that arrives after cancellation', async () => {
  const controller = new AbortController();
  await assert.rejects(requestJson(endpoint, { signal: controller.signal, fetchImpl: async () => { controller.abort(); return Response.json({ ok: true }); } }), failed('cancelled'));
});
test('response timeout remains active until the entire body arrives', async () => {
  let cancelled = false;
  await assert.rejects(requestJson(endpoint, { timeoutMs: 10, fetchImpl: async (_path, { signal }) => {
    const stream = new ReadableStream({ start(c) { c.enqueue(encoder.encode('{"ok":')); signal.addEventListener('abort', () => { cancelled = true; c.error(new Error('aborted')); }); } });
    return new Response(stream, { headers: { 'content-type': 'application/json' } });
  } }), failed('timeout'));
  assert.equal(cancelled, true);
});
