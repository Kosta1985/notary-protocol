const BASE = process.env.ACCORDTRACE_BASE ?? 'https://accordtrace.notary-labs.workers.dev';
const EXPECTED_VERSION = '0.2.1';

async function json(path, init = {}) {
  try {
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
    return { path, response, body, error: null };
  } catch (error) {
    return { path, response: null, body: null, error: error.message };
  }
}

function interfaceDeclaresV1(card) {
  return card?.protocolVersion === '1.0'
    || card?.supportedInterfaces?.some((item) => item?.protocolVersion === '1.0')
    || card?.extra?.supportedInterfaces?.some((item) => item?.protocolVersion === '1.0');
}

function cardFingerprint(card) {
  if (!card || typeof card !== 'object' || Array.isArray(card)) return null;
  return JSON.stringify({
    name: card.name ?? null,
    version: card.version ?? null,
    url: card.url ?? null,
    protocolVersion: card.protocolVersion ?? null,
    skills: Array.isArray(card.skills) ? card.skills.map((skill) => skill?.id ?? skill?.name ?? null) : []
  });
}

async function main() {
  const failures = [];
  const observations = {};
  const check = (condition, message) => {
    if (!condition) failures.push(message);
  };

  const card = await json('/.well-known/agent-card.json');
  observations.agentCard = {
    status: card.response?.status ?? null,
    version: card.body?.version ?? null,
    skills: Array.isArray(card.body?.skills) ? card.body.skills.length : null,
    a2aV1: interfaceDeclaresV1(card.body)
  };
  check(!card.error, `Agent card request failed: ${card.error}`);
  check(card.response?.ok, `Agent card HTTP ${card.response?.status ?? 'unreachable'}`);
  if (card.response?.ok) {
    check(card.body?.version === EXPECTED_VERSION, `Agent card version drift: expected ${EXPECTED_VERSION}, got ${card.body?.version}`);
    check(interfaceDeclaresV1(card.body), 'A2A v1.0 is not declared in Agent Card');
    check(Array.isArray(card.body?.skills) && card.body.skills.length >= 4, `Expected at least four Accord Trace skills, got ${card.body?.skills?.length ?? 0}`);
  }

  // Some agent directories and older A2A clients still probe this legacy alias.
  // Treat it as a compatibility signal so discovery regressions are visible immediately.
  const legacyCard = await json('/.well-known/agent.json');
  observations.legacyAgentCard = {
    status: legacyCard.response?.status ?? null,
    version: legacyCard.body?.version ?? null,
    compatibleWithCanonical: legacyCard.response?.ok && card.response?.ok
      ? cardFingerprint(legacyCard.body) === cardFingerprint(card.body)
      : false
  };
  check(!legacyCard.error, `Legacy Agent Card request failed: ${legacyCard.error}`);
  check(legacyCard.response?.ok, `Legacy Agent Card alias HTTP ${legacyCard.response?.status ?? 'unreachable'}`);
  if (legacyCard.response?.ok && card.response?.ok) {
    check(cardFingerprint(legacyCard.body) === cardFingerprint(card.body), 'Legacy Agent Card alias differs from canonical discovery metadata');
  }

  let stats = await json('/v1/stats');
  if (!stats.response?.ok) {
    const canonical = await json('/api/v1/stats');
    if (canonical.response?.ok) stats = canonical;
  }
  observations.stats = {
    path: stats.path,
    status: stats.response?.status ?? null,
    hasPrivacyBoundary: Boolean(stats.body?.privacy),
    activeAgents: stats.body?.agents ?? null
  };
  check(!stats.error, `Stats request failed: ${stats.error}`);
  check(stats.response?.ok, `Stats unavailable on /v1/stats and /api/v1/stats (last HTTP ${stats.response?.status ?? 'unreachable'})`);
  if (stats.response?.ok) {
    check(stats.body && typeof stats.body === 'object' && !Array.isArray(stats.body), 'Stats response is not a JSON object');
    check(Boolean(stats.body?.privacy), 'Stats response must declare its privacy boundary');
  }

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
  observations.a2a = {
    status: heartbeat.response?.status ?? null,
    jsonrpc: heartbeat.body?.jsonrpc ?? null,
    responseId: heartbeat.body?.id ?? null,
    error: heartbeat.body?.error ?? heartbeat.error ?? null
  };
  check(!heartbeat.error, `A2A heartbeat request failed: ${heartbeat.error}`);
  check(heartbeat.response?.ok, `A2A heartbeat HTTP ${heartbeat.response?.status ?? 'unreachable'}`);
  if (heartbeat.response?.ok) {
    check(heartbeat.body?.jsonrpc === '2.0', 'A2A heartbeat did not return JSON-RPC 2.0');
    check(heartbeat.body?.id != null, 'A2A heartbeat response has no id');
  }

  const report = {
    ok: failures.length === 0,
    service: 'Accord Trace',
    expectedVersion: EXPECTED_VERSION,
    observations,
    failures,
    checkedAt: new Date().toISOString()
  };
  console.log(JSON.stringify(report, null, 2));

  if (failures.length) {
    throw new Error(`${failures.length} production contract issue(s): ${failures.join(' | ')}`);
  }
}

main().catch((error) => {
  console.error(`Accord Trace live contract failed: ${error.message}`);
  process.exit(1);
});
