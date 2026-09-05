/** Transport used only by the disposable wallet E2E runner, never production. */
export class SandboxHttpError extends Error {
  constructor(code, { status = null, attempts = 0 } = {}) {
    super(code);
    this.name = 'SandboxHttpError';
    this.code = code;
    this.status = status;
    this.attempts = attempts;
  }
}

export function isolatedBaseUrl(value) {
  let url;
  try { url = new URL(value); } catch { throw new SandboxHttpError('INVALID_SANDBOX_URL'); }
  if (url.protocol !== 'https:' || url.port || url.username || url.password ||
      url.search || url.hash || url.pathname !== '/' ||
      !/^at-wallet-e2e-[0-9]+(?:-[0-9]+)?\.[a-z0-9-]+\.workers\.dev$/.test(url.hostname)) {
    throw new SandboxHttpError('ISOLATED_SANDBOX_REQUIRED');
  }
  return url;
}

export function missingWorker(response, payload) {
  return response.status === 404 && payload?.error_code === 1042 &&
    payload?.title === 'Error 1042: Cloudflare Error' &&
    payload?.detail === 'No Workers script was found for this host on workers.dev.';
}

/**
 * Retry ONLY the explicit pre-application missing-worker response observed at
 * initial workers.dev activation. Never retry generic 404s, 5xx, timeouts,
 * signature errors or ambiguous writes. The factory must create a fresh Request
 * for each attempt; callers retain the same economic idempotency key.
 */
export async function sandboxJson(makeRequest, {
  fetchImpl = fetch, expected = [200, 201], maxAttempts = 15,
  retryDelayMs = 2000, timeoutMs = 15000, maxBytes = 262144,
  sleep = ms => new Promise(resolve => setTimeout(resolve, ms)),
  onRetry = () => {}
} = {}) {
  if (!Number.isInteger(maxAttempts) || maxAttempts < 1 || maxAttempts > 20 ||
      !Number.isInteger(timeoutMs) || timeoutMs < 1 || timeoutMs > 15000 ||
      !Number.isInteger(retryDelayMs) || retryDelayMs < 0 || retryDelayMs > 3000 ||
      !Number.isInteger(maxBytes) || maxBytes < 1 || maxBytes > 1048576) {
    throw new SandboxHttpError('INVALID_TRANSPORT_LIMITS');
  }
  let origin;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    const request = await makeRequest();
    const target = new URL(request.url);
    isolatedBaseUrl(target.origin);
    if (target.username || target.password || (origin && target.origin !== origin)) {
      throw new SandboxHttpError('SANDBOX_ORIGIN_CHANGED');
    }
    origin = target.origin;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    let response, payload;
    try {
      response = await fetchImpl(request, { redirect: 'error', signal: controller.signal });
      payload = await boundedJson(response, controller.signal, maxBytes);
    } catch (error) {
      if (error instanceof SandboxHttpError) throw error;
      throw new SandboxHttpError('NETWORK_OR_TIMEOUT', { attempts: attempt });
    } finally {
      clearTimeout(timer);
    }
    if (missingWorker(response, payload)) {
      if (attempt === maxAttempts) {
        throw new SandboxHttpError('WORKER_ACTIVATION_TIMEOUT', { status: 404, attempts: attempt });
      }
      onRetry({ attempt, code: 'WORKER_NOT_YET_AVAILABLE' });
      await sleep(retryDelayMs);
      continue;
    }
    if (!expected.includes(response.status)) {
      throw new SandboxHttpError('UNEXPECTED_HTTP_STATUS', { status: response.status, attempts: attempt });
    }
    return payload;
  }
}

async function boundedJson(response, signal, maxBytes) {
  const type = (response.headers.get('content-type') || '').split(';')[0].trim().toLowerCase();
  if (!/^application\/(?:[a-z0-9.-]+\+)?json$/.test(type)) {
    await response.body?.cancel().catch(() => {});
    throw new SandboxHttpError('NON_JSON_RESPONSE', { status: response.status });
  }
  const length = Number(response.headers.get('content-length'));
  if (Number.isFinite(length) && length > maxBytes) {
    await response.body?.cancel().catch(() => {});
    throw new SandboxHttpError('RESPONSE_TOO_LARGE', { status: response.status });
  }
  if (!response.body) throw new SandboxHttpError('EMPTY_RESPONSE', { status: response.status });
  const reader = response.body.getReader();
  let onAbort;
  const aborted = new Promise((_, reject) => {
    onAbort = () => reject(new SandboxHttpError('NETWORK_OR_TIMEOUT'));
    signal.addEventListener('abort', onAbort, { once: true });
  });
  const decoder = new TextDecoder('utf-8', { fatal: true });
  let bytes = 0, text = '';
  try {
    for (;;) {
      if (signal.aborted) throw new SandboxHttpError('NETWORK_OR_TIMEOUT');
      const { value, done } = await Promise.race([reader.read(), aborted]);
      if (done) break;
      bytes += value.byteLength;
      if (bytes > maxBytes) throw new SandboxHttpError('RESPONSE_TOO_LARGE');
      text += decoder.decode(value, { stream: true });
    }
    text += decoder.decode();
    const body = JSON.parse(text);
    if (!body || typeof body !== 'object' || Array.isArray(body)) {
      throw new SandboxHttpError('INVALID_JSON_DOCUMENT');
    }
    return body;
  } catch (error) {
    if (error instanceof SandboxHttpError) throw error;
    throw new SandboxHttpError('INVALID_JSON_DOCUMENT');
  } finally {
    signal.removeEventListener('abort', onAbort);
    void reader.cancel().catch(() => {});
  }
}
