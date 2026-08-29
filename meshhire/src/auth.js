export async function authenticate(request, env, { optional = false } = {}) {
  const auth = request.headers.get('authorization') || '';
  if (!auth.startsWith('Bearer ')) {
    if (optional) return null;
    throw httpError('unauthorized', 401, 'Bearer API key required');
  }
  const token = auth.slice(7).trim();
  if (token.length < 24) throw httpError('unauthorized', 401, 'Invalid API key');
  const hash = await sha256(token);
  const row = await env.DB.prepare(`SELECT k.id AS key_id,k.principal_id,p.display_name,p.status FROM api_keys k JOIN principals p ON p.id=k.principal_id WHERE k.key_hash=?1 AND k.status='active'`).bind(hash).first();
  if (!row || row.status !== 'active') throw httpError('unauthorized', 401, 'Invalid API key');
  env.DB.prepare('UPDATE api_keys SET last_used_at=?1 WHERE id=?2').bind(new Date().toISOString(), row.key_id).run().catch(()=>{});
  return row;
}
export async function sha256(value) {
  const bytes = new TextEncoder().encode(value);
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return [...new Uint8Array(digest)].map(b=>b.toString(16).padStart(2,'0')).join('');
}
export function requireOwner(actual, principalId) {
  if (!actual || actual !== principalId) throw httpError('forbidden', 403, 'Principal does not own this resource');
}
function httpError(code,status,message){const e=new Error(message);e.code=code;e.status=status;return e;}
