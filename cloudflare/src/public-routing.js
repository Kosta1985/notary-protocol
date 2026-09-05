// Small public HTTP contracts only. Payment, operator and signed-action routes
// are not rewritten, redirected or enabled by this module.
const READ_ONLY_METADATA = new Set([
  '/health', '/mcp', '/a2a', '/openapi.json',
  '/.well-known/agent-card.json', '/.well-known/agent.json'
]);
const POST_ONLY = new Set(['/api/v1/hash', '/api/v1/verify', '/api/v1/proofs']);

export function publicRouteResponse(request) {
  const url = new URL(request.url);
  if (['GET', 'HEAD'].includes(request.method) && ['/docs', '/docs.html'].includes(url.pathname)) {
    // Keep previously published documentation links working. Do not forward
    // arbitrary query parameters into the new page.
    return Response.redirect(new URL('/developers', url).href, 308);
  }
  const allow = POST_ONLY.has(url.pathname) ? 'POST, OPTIONS'
    : ['/mcp', '/a2a'].includes(url.pathname) ? 'GET, HEAD, POST, OPTIONS'
    : READ_ONLY_METADATA.has(url.pathname) ? 'GET, HEAD, OPTIONS' : null;
  if (allow && !allow.split(', ').includes(request.method)) {
    return Response.json({error: 'method_not_allowed'}, {
      status: 405,
      headers: {
        allow, 'access-control-allow-origin': '*',
        'access-control-allow-methods': allow, 'cache-control': 'no-store'
      }
    });
  }
  return null;
}

export function metadataRequest(request) {
  if (request.method !== 'HEAD' || !READ_ONLY_METADATA.has(new URL(request.url).pathname)) return request;
  return new Request(request.url, {method: 'GET', headers: request.headers});
}

export async function publicNotFound(response, request, env) {
  if (response.status !== 404 || !['GET', 'HEAD'].includes(request.method)) return response;
  const url = new URL(request.url);
  if (/^\/(?:api|v1)(?:\/|$)/.test(url.pathname)) {
    // Preserve domain-specific errors, but never return the site's HTML to an API client.
    if ((response.headers.get('content-type') || '').includes('application/json')) return response;
    void response.body?.cancel().catch(() => {});
    return Response.json({error: 'not_found'}, {status: 404, headers: {
      'cache-control': 'no-store', 'access-control-allow-origin': '*'
    }});
  }
  if (!(request.headers.get('accept') || '').includes('text/html')
      || /\/[^/]+\.[^/]+$/.test(url.pathname) && !/\.html$/.test(url.pathname)
      || !env?.ASSETS?.fetch) return response;
  let page;
  try {
    page = await env.ASSETS.fetch(new Request(new URL('/404.html', request.url), {method: 'GET'}));
    // Cloudflare's default HTML handling redirects file.html to /file, even
    // through the assets binding. Follow only this known local alias once.
    if ([301, 302, 307, 308].includes(page.status)) {
      const target = new URL(page.headers.get('location') || '', request.url);
      if (target.origin !== url.origin || target.pathname !== '/404' || target.search || target.hash) {
        void page.body?.cancel().catch(() => {});
        return response;
      }
      void page.body?.cancel().catch(() => {});
      page = await env.ASSETS.fetch(new Request(target, {method: 'GET'}));
    }
  } catch { return response; }
  if (!page.ok || !(page.headers.get('content-type') || '').includes('text/html')) {
    void page.body?.cancel().catch(() => {});
    return response;
  }
  void response.body?.cancel().catch(() => {});
  return new Response(page.body, {status: 404, headers: {
    'content-type': 'text/html; charset=utf-8',
    'cache-control': 'no-store', 'x-robots-tag': 'noindex'
  }});
}
