import test from 'node:test';
import assert from 'node:assert/strict';
import { isolatedBaseUrl, sandboxJson, SandboxHttpError } from '../scripts/lib/wallet-e2e-http.mjs';

const base = 'https://at-wallet-e2e-123.notary-labs.workers.dev';
const make = () => new Request(`${base}/api/v1/agent/wallet-capabilities`);
const edge = () => Response.json({ error_code: 1042, title: 'Error 1042: Cloudflare Error', detail: 'No Workers script was found for this host on workers.dev.' }, { status: 404 });
const opts = { retryDelayMs: 0, sleep: async () => {} };

test('E2E transport accepts only disposable wallet origins before network access', async () => {
  assert.equal(isolatedBaseUrl(base).origin, base);
  for (const bad of ['https://accordtrace.notary-labs.workers.dev', 'http://at-wallet-e2e-1.x.workers.dev', `${base}/path`, `${base}?token=x`, `${base}#x`, 'https://user:secret@at-wallet-e2e-1.x.workers.dev', 'https://at-wallet-e2e-1.x.workers.dev.attacker.example']) {
    assert.throws(() => isolatedBaseUrl(bad), SandboxHttpError);
  }
  let calls = 0;
  await assert.rejects(sandboxJson(() => new Request('https://example.com'), { fetchImpl: async () => { calls++; } }), /ISOLATED_SANDBOX_REQUIRED/);
  assert.equal(calls, 0);
});

test('E2E transport retries observed worker activation failure with fresh requests', async () => {
  let calls = 0;
  const requests = [], retries = [];
  const body = await sandboxJson(() => new Request(`${base}/api/v1/agent/payments`, {
    method: 'POST', headers: { 'idempotency-key': 'stable-payment-key' }, body: '{}'
  }), { ...opts, onRetry: x => retries.push(x), fetchImpl: async (request, init) => {
    requests.push(request);
    assert.equal(init.redirect, 'error');
    assert.equal(request.headers.get('idempotency-key'), 'stable-payment-key');
    assert.equal(await request.text(), '{}');
    return ++calls < 3 ? edge() : Response.json({ ok: true });
  } });
  assert.equal(body.ok, true);
  assert.equal(new Set(requests).size, 3);
  assert.equal(retries.length, 2);
});

test('E2E transport exhausts a finite worker activation budget', async () => {
  let calls = 0;
  await assert.rejects(sandboxJson(make, { ...opts, maxAttempts: 3, fetchImpl: async () => { calls++; return edge(); } }),
    e => e.code === 'WORKER_ACTIVATION_TIMEOUT' && e.attempts === 3);
  assert.equal(calls, 3);
});

test('E2E transport never retries application failures or ambiguous writes', async () => {
  for (const status of [401, 403, 404, 409, 422, 429, 500, 502, 503]) {
    let calls = 0;
    await assert.rejects(sandboxJson(make, { ...opts, fetchImpl: async () => {
      calls++; return Response.json({ error: 'internal-secret-not-for-report' }, { status });
    } }), e => e.code === 'UNEXPECTED_HTTP_STATUS' && e.status === status && !e.message.includes('secret'));
    assert.equal(calls, 1);
  }
  let calls = 0;
  await assert.rejects(sandboxJson(make, { ...opts, fetchImpl: async () => { calls++; throw new Error('secret transport data'); } }), /NETWORK_OR_TIMEOUT/);
  assert.equal(calls, 1);
});

test('E2E transport does not confuse an application error_code with the observed edge response', async () => {
  let calls = 0;
  await assert.rejects(sandboxJson(make, { ...opts, fetchImpl: async () => { calls++; return Response.json({ error_code: 1042 }, { status: 404 }); } }), /UNEXPECTED_HTTP_STATUS/);
  assert.equal(calls, 1);
});

test('E2E expected denial is returned for assertions, not converted to success', async () => {
  const payload = await sandboxJson(make, { expected: [422], fetchImpl: async () => Response.json({ error: { code: 'INSUFFICIENT_BALANCE' } }, { status: 422 }) });
  assert.equal(payload.error.code, 'INSUFFICIENT_BALANCE');
});

test('E2E response parser rejects malformed, non-object and HTML documents', async () => {
  for (const value of ['null', '[]', 'false', 'oops']) {
    await assert.rejects(sandboxJson(make, { fetchImpl: async () => new Response(value, { headers: { 'content-type': 'application/json' } }) }), /INVALID_JSON_DOCUMENT/);
  }
  await assert.rejects(sandboxJson(make, { fetchImpl: async () => new Response('secret HTML', { headers: { 'content-type': 'text/html' } }) }), /NON_JSON_RESPONSE/);
});

test('E2E response size limit applies even when content-length understates the body', async () => {
  await assert.rejects(sandboxJson(make, { maxBytes: 10, fetchImpl: async () => new Response(JSON.stringify({ long: 'x'.repeat(100) }), { headers: { 'content-type': 'application/json', 'content-length': '1' } }) }), /RESPONSE_TOO_LARGE/);
});

test('E2E response rejects corrupt UTF-8', async () => {
  await assert.rejects(sandboxJson(make, { fetchImpl: async () => new Response(new Uint8Array([123, 34, 120, 34, 58, 34, 255, 34, 125]), { headers: { 'content-type': 'application/json' } }) }), /INVALID_JSON_DOCUMENT/);
});

test('E2E timeout remains active while response body is stalled', async () => {
  let cancelled = false;
  await assert.rejects(sandboxJson(make, { timeoutMs: 10, fetchImpl: async () => new Response(new ReadableStream({ cancel() { cancelled = true; } }), { headers: { 'content-type': 'application/json' } }) }), /NETWORK_OR_TIMEOUT/);
  assert.equal(cancelled, true);
});

test('E2E transport rejects origin changes across attempts', async () => {
  let factories = 0, calls = 0;
  await assert.rejects(sandboxJson(() => new Request(`${++factories === 1 ? base : 'https://at-wallet-e2e-999.other.workers.dev'}/api`), {
    ...opts, fetchImpl: async () => { calls++; return edge(); }
  }), /SANDBOX_ORIGIN_CHANGED/);
  assert.equal(calls, 1);
});

test('E2E transport validates retry and timeout bounds', async () => {
  for (const limits of [{ maxAttempts: 0 }, { maxAttempts: 21 }, { timeoutMs: 0 }, { timeoutMs: 15001 }, { maxBytes: 0 }, { retryDelayMs: 3001 }]) {
    await assert.rejects(sandboxJson(make, limits), /INVALID_TRANSPORT_LIMITS/);
  }
});
