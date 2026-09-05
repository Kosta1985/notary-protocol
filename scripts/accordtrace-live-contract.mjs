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
  'wallet_capabilities',
  'resolve_referral'
];
const A2A_METHODS = ['message/send', 'SendMessage'];

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

async function readNetworkCapabilitiesViaA2A(method) {
  const id = `accordtrace-live-contract-network-${method.replace(/[^a-z0-9]+/gi, '-')}`;
  const read = await json('/a2a', {
    method: 'POST',
    headers: { 'A2A-Version': '1.0' },
    body: JSON.stringify({
      jsonrpc: '2.0',
      id,
      method,
      params: {
        message: {
          messageId: id,
          role: 'ROLE_USER',
          parts: [{
            data: { action: 'network_capabilities', arguments: {} },
            mediaType: 'application/json'
          }]
        }
      }
    })
  });
  return {
    method,
    read,
    data: read.body?.result?.task?.artifacts?.[0]?.parts?.[0]?.data ?? null
  };
}

function a2aObservation(probe) {
  const { method, read, data } = probe;
  return {
    method,
    status: read.response?.status ?? null,
    jsonrpc: read.body?.jsonrpc ?? null,
    responseId: read.body?.id ?? null,
    error: read.body?.error ?? read.error ?? null,
    action: 'network_capabilities',
    model: data?.model ?? null,
    passportPriceAtomic: data?.passport_price?.amount_atomic ?? null,
    directCommissionAtomic: data?.direct_commission?.amount_atomic ?? null,
    cashPayoutsEnabled: data?.cash_payouts_enabled ?? null
  };
}

function validateA2AProbe(probe, check) {
  const { method, read, data } = probe;
  const label = `A2A ${method}`;
  check(!read.error, `${label} network capability request failed: ${read.error}`);
  check(read.response?.ok, `${label} network capability HTTP ${read.response?.status ?? 'unreachable'}`);
  if (!read.response?.ok) return;
  check(!read.body?.error, `${label} network capability returned JSON-RPC error: ${JSON.stringify(read.body?.error)}`);
  check(read.body?.jsonrpc === '2.0', `${label} did not return JSON-RPC 2.0`);
  check(data?.model === 'single_level_direct_product_referral', `${label} unexpected affiliate model: ${data?.model}`);
  check(data?.passport_price?.amount_atomic === 200, `${label} unexpected Passport product price: ${data?.passport_price?.amount_atomic}`);
  check(data?.direct_commission?.amount_atomic === 100, `${label} unexpected direct commission: ${data?.direct_commission?.amount_atomic}`);
  check(data?.cash_payouts_enabled === false, `${label} affiliate cash payouts unexpectedly enabled`);
  check(data?.rules?.includes('no_multilevel_downline_commission'), `${label} no-downline policy missing`);
  check(data?.rules?.includes('no_self_referral'), `${label} no-self-referral policy missing`);
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

  const wallet = await json('/api/v1/agent/wallet-capabilities');
  observations.wallet = {
    status: wallet.response?.status ?? null,
    audience: wallet.body?.audience ?? null,
    fundedBalanceOnly: wallet.body?.payment_contract?.funded_balance_only ?? null,
    creditEnabled: wallet.body?.credit_and_lending?.enabled ?? null,
    mutationsRequirePassportSignature: wallet.body?.machine_protocols?.mutations_require_direct_passport_signed_request ?? null
  };
  check(!wallet.error, `Agent Wallet capability request failed: ${wallet.error}`);
  check(wallet.response?.ok, `Agent Wallet capability HTTP ${wallet.response?.status ?? 'unreachable'}`);
  if (wallet.response?.ok) {
    check(wallet.body?.audience === 'autonomous_agents', `Agent Wallet audience drift: ${wallet.body?.audience}`);
    check(wallet.body?.machine_first === true, 'Agent Wallet machine_first must be true');
    check(wallet.body?.payment_contract?.funded_balance_only === true, 'Agent Wallet funded_balance_only must be true');
    check(wallet.body?.payment_contract?.negative_balances === false, 'Agent Wallet negative balances unexpectedly enabled');
    check(wallet.body?.credit_and_lending?.enabled === false, 'Agent Wallet credit/lending unexpectedly enabled');
    check(wallet.body?.machine_protocols?.mutations_require_direct_passport_signed_request === true, 'Agent Wallet mutation signature boundary missing');
  }

  const probes = [];
  for (const method of A2A_METHODS) probes.push(await readNetworkCapabilitiesViaA2A(method));
  for (const probe of probes) validateA2AProbe(probe, check);

  const canonicalProbe = probes.find((probe) => probe.method === 'message/send') ?? probes[0];
  observations.a2a = {
    ...a2aObservation(canonicalProbe),
    canonicalMethod: 'message/send',
    compatibilityMethod: 'SendMessage',
    methods: Object.fromEntries(probes.map((probe) => [probe.method, a2aObservation(probe)]))
  };

  if (probes.every((probe) => probe.read.response?.ok && !probe.read.body?.error)) {
    const fingerprints = probes.map((probe) => JSON.stringify({
      model: probe.data?.model ?? null,
      passportPriceAtomic: probe.data?.passport_price?.amount_atomic ?? null,
      directCommissionAtomic: probe.data?.direct_commission?.amount_atomic ?? null,
      cashPayoutsEnabled: probe.data?.cash_payouts_enabled ?? null,
      rules: probe.data?.rules ?? null
    }));
    check(new Set(fingerprints).size === 1, 'A2A message/send and SendMessage returned different network policy semantics');
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