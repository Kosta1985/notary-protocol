const BASE = process.env.ACCORDTRACE_BASE ?? 'https://accordtrace.notary-labs.workers.dev';
const EXPECTED_VERSION = '0.2.1';

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

async function json(path, init = {}) {
  const response = await fetch(`${BASE}${path}`, {
    ...init,
    headers: {
      accept: 'application/json',
      'content-type': 'application/json',
      'x-notary-monitor': 'live-smoke',
      ...(init.headers ?? {})
    }
  });
  const text = await response.text();
  let body;
  try { body = JSON.parse(text); } catch { body = text; }
  return { response, body };
}

async function main() {
  const card = await json('/.well-known/agent-card.json');
  assert(card.response.ok, `Agent card HTTP ${card.response.status}`);
  assert(card.body?.version === EXPECTED_VERSION, `Agent card version drift: expected ${EXPECTED_VERSION}, got ${card.body?.version}`);
  assert(card.body?.protocolVersion === '1.0' || card.body?.extra?.supportedInterfaces?.some((x) => x.protocolVersion === '1.0'), 'A2A v1.0 is not declared');
  assert(Array.isArray(card.body?.skills) && card.body.skills.length >= 4, 'Expected at least four Accord Trace skills');

  const stats = await json('/v1/stats');
  assert(stats.response.ok, `Stats HTTP ${stats.response.status}`);
  assert(stats.body && typeof stats.body === 'object', 'Stats response is not JSON');
  assert(stats.body.privacy, 'Stats response must declare its privacy boundary');

  const heartbeat = await json('/a2a', {
    method: 'POST',
    headers: { 'A2A-Version': '1.0' },
    body: JSON.stringify({
      jsonrpc: '2.0',
      id: 'accordtrace-monitor',
      method: 'SendMessage',
      params: {
        message: {
          messageId: 'accordtrace-monitor',
          role: 'ROLE_USER',
          parts: [{ text: 'health heartbeat; do not create persistent evidence' }]
        }
      }
    })
  });
  assert(heartbeat.response.ok, `A2A heartbeat HTTP ${heartbeat.response.status}`);
  assert(heartbeat.body?.jsonrpc === '2.0', 'A2A heartbeat did not return JSON-RPC 2.0');
  assert(heartbeat.body?.id != null, 'A2A heartbeat response has no id');

  console.log(JSON.stringify({
    ok: true,
    service: 'Accord Trace',
    version: card.body.version,
    skills: card.body.skills.length,
    stats: true,
    jsonrpc: true,
    checkedAt: new Date().toISOString()
  }, null, 2));
}

main().catch((error) => {
  console.error(`Accord Trace live contract failed: ${error.message}`);
  process.exit(1);
});
