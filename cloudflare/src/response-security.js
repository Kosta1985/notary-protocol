// Apply response protections at the outer boundary, including caught failures.
// Static asset responses also use web/_headers, because the asset router can
// bypass the Worker. Never expose unexpected database/runtime error details.
export async function secureResponse(response, { method = 'GET' } = {}) {
  const headers = new Headers(response.headers);
  headers.set('x-content-type-options', 'nosniff');
  headers.set('referrer-policy', 'no-referrer');
  headers.set('x-frame-options', 'DENY');
  if (!headers.has('permissions-policy')) headers.set('permissions-policy', 'camera=(), microphone=(), geolocation=()');
  if (!headers.has('content-security-policy')) {
    headers.set('content-security-policy', (headers.get('content-type') || '').includes('text/html')
      ? "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; connect-src 'self'; img-src 'self' data:; font-src 'self'; object-src 'none'; base-uri 'none'; form-action 'self'; frame-ancestors 'none'"
      : "default-src 'none'; frame-ancestors 'none'; base-uri 'none'");
  }
  let body = response.body;
  if (response.status === 500) {
    const requestId = crypto.randomUUID();
    let envelope = null;
    if ((headers.get('content-type') || '').includes('application/json')) {
      try { envelope = await response.json(); } catch { /* Never reflect raw errors. */ }
    } else { void body?.cancel().catch(() => {}); }
    const message = 'The service could not complete this request. Please retry.';
    const rpcId = envelope?.id;
    const validRpcId = rpcId === null || typeof rpcId === 'string' && rpcId.length <= 200 || typeof rpcId === 'number' && Number.isFinite(rpcId);
    body = envelope?.jsonrpc === '2.0' && envelope?.error && validRpcId
      ? JSON.stringify({ jsonrpc: '2.0', id: rpcId, error: { code: -32603, message, data: { request_id: requestId } } })
      : JSON.stringify({ error: 'internal_error', message, request_id: requestId });
    headers.set('content-type', 'application/json; charset=utf-8');
    headers.set('cache-control', 'no-store');
    headers.set('x-request-id', requestId);
    for (const name of ['content-length', 'content-encoding', 'etag']) headers.delete(name);
    console.error(JSON.stringify({ event: 'accordtrace_internal_error', request_id: requestId }));
  }
  return new Response(method === 'HEAD' ? null : body, { status: response.status, statusText: response.statusText, headers });
}
export function unexpectedErrorResponse() {
  return new Response(null, { status: 500, headers: { 'content-type': 'application/json; charset=utf-8', 'access-control-allow-origin': '*' } });
}
