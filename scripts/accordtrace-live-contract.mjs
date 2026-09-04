const BASE = process.env.ACCORDTRACE_BASE ?? 'https://accordtrace.notary-labs.workers.dev';
const EXPECTED_VERSION = '0.2.1';
const REQUIRED_SKILLS = [
  'notarize_evidence',
  'verify_proof',
  'get_proof',
  'hash_content',
  'network_capabilities',
  'network_stats',
  'passport_product_capabilities',
  'resolve_referral'
];

async function json(path, init = {}) {
  try {
    const response = await fetch(`${BASE}${path}`, {
      ...init,
      headers: {
        accept: 'application/json',
        'content-type': 'application/json',
        'x-notary-monitor': 'live-contract',
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

function skillIds(card) {
  return Array.isArray(card?.skills) ? card.skills.map((skill) => skill?.id ?? skill?.name ?? null).filter(Boolean) : [];
}

function cardFingerprint(card) {
  if (!card || typeof card !== 'object' || Array.isArray(card)) return null;
  return JSON.stringify({
    name: card.name ?? null,
    version: card.version ?? null,
    url: card.url ?? null,
    protocolVersion: card.protocolVersion ?? null,
    supportedInterfaces: card.supportedInterfaces ?? null,
    skills: skillIds(card)
  });
}

async function main() {
  const failures = [];
  const observations = {};
  const check = (condition, message) => {
    if (!condition) failures.push(message);
  };

  const card = await json('/.well-known/agent-card.json');
  const cardSkills = skillIds(card.body);
  observations.agentCard = {
    status: card.response?.status ?? null,
    version: card.body?.version ?? null,
    skills: cardSkills,
    a2aV1: interfaceDeclaresV1(card.body)
  };
  check(!card.error, `Agent card request failed: ${card.error}`);
  check(card.response?.ok, `Agent card HTTP ${card.response?.status ?? 'unreachable'}`);
  if (card.response?.ok) {
    check(card.body?.name === 'Accord Trace', `Agent card name drift: ${card.body?.name}`);
    check(card.body?.version === EXPECTED_VERSION, `Agent card version drift: expected ${EXPECTED_VERSION}, got ${card.body?.version}`);
    check(interfaceDeclaresV1(card.body), 'A2A v1.0 is not declared in Agent Card');
    for (const skill of REQUIRED_SKILLS) check(cardSkills.includes(skill), `Agent Card missing required skill: ${skill}`);
  }

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

  const networkRead = await json('/a2a', {
    method: 'POST',
    headers: { 'A2A-Version': '1.0' },
    body: JSON.stringify({
      jsonrpc: '2.0',
      id: 'accordtrace-live-contract-network',
      method: 'SendMessage',
      params: {
        message: {
          messageId: 'accordtrace-live-contract-network',
          role: 'ROLE_USER',
          parts: [{
            data: { action: 'network_capabilities', arguments: {} },
            mediaType: 'application/json'
          }]
        }
      }
    })
  });
  const networkData = networkRead.body?.result?.task?.artifacts?.[0]?.parts?.[0]?.data;
  observations.a2a = {
    status: networkRead.response?.status ?? null,
    jsonrpc: networkRead.body?.jsonrpc ?? null,
    responseId: networkRead.body?.id ?? null,
    error: networkRead.body?.error ?? networkRead.error ?? null,
    action: 'network_capabilities',
    model: networkData?.model ?? null,
    passportPriceAtomic: networkData?.passport_price?.amount_atomic ?? null,
    directCommissionAtomic: networkData?.direct_commission?.amount_atomic ?? null,
    cashPayoutsEnabled: networkData?.cash_payouts_enabled ?? null
  };
  check(!networkRead.error, `A2A network capability request failed: ${networkRead.error}`);
  check(networkRead.response?.ok, `A2A network capability HTTP ${networkRead.response?.status ?? 'unreachable'}`);
  if (networkRead.response?.ok) {
    check(!networkRead.body?.error, `A2A network capability returned JSON-RPC error: ${JSON.stringify(networkRead.body?.error)}`);
    check(networkRead.body?.jsonrpc === '2.0', 'A2A network capability did not return JSON-RPC 2.0');
    check(networkData?.model === 'single_level_direct_product_referral', `Unexpected affiliate model: ${networkData?.model}`);
    check(networkData?.passport_price?.amount_atomic === 200, `Unexpected Passport product price: ${networkData?.passport_price?.amount_atomic}`);
    check(networkData?.direct_commission?.amount_atomic === 100, `Unexpected direct commission: ${networkData?.direct_commission?.amount_atomic}`);
    check(networkData?.cash_payouts_enabled === false, 'Affiliate cash payouts unexpectedly enabled');
    check(networkData?.rules?.includes('no_multilevel_downline_commission'), 'No-downline policy missing from live A2A response');
    check(networkData?.rules?.includes('no_self_referral'), 'No-self-referral policy missing from live A2A response');
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

  if (failures.length) throw new Error(`${failures.length} production contract issue(s): ${failures.join(' | ')}`);
}

main().catch((error) => {
  console.error(`Accord Trace live contract failed: ${error.message}`);
  process.exit(1);
});
