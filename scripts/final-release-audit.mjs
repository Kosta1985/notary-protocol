import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const failures = [];
const checks = [];
const HOST = 'https://accordtrace.notary-labs.workers.dev';
const MCP_ID = 'io.github.Kosta1985/accord-trace';
const VERSION = '0.2.1';
const PASSPORT_PRICE = 'price_1UC8x6L1V4ptaCD2i8kiwoPF';

function ok(name, condition, detail = '') {
  checks.push({ name, ok: Boolean(condition), detail: detail || undefined });
  if (!condition) failures.push(detail ? `${name}: ${detail}` : name);
}
function read(rel) { return fs.readFileSync(path.join(root, rel), 'utf8'); }
function json(rel) { return JSON.parse(read(rel)); }

const required = [
  'wrangler.jsonc',
  'cloudflare/src/worker-v2.js',
  'cloudflare/src/interoperability.js',
  'cloudflare/src/passport-product.js',
  'cloudflare/src/affiliate.js',
  'cloudflare/src/alert-adapters.js',
  'cloudflare/src/control-plane.js',
  'cloudflare/src/control-plane-hardening.js',
  'web/.well-known/agent.json',
  'web/.well-known/mcp.json',
  'adapters/a2a/agent-card.json',
  'web/index.html',
  'web/passport.html',
  'web/network.html',
  'web/ai.html',
  'web/llms.txt',
  'web/llms-full.txt',
  'README.md',
  'llms-install.md',
  '.github/workflows/deploy-accordtrace.yml',
  '.github/workflows/ci.yml',
  '.github/workflows/accordtrace-live-contract.yml',
  'docs/PASSPORT_LAUNCH_CAMPAIGN.md',
  'docs/STRIPE_PASSPORT_ACTIVATION.md',
  'scripts/accordtrace-live-contract.mjs',
  'scripts/framework-integration-audit.mjs',
  'examples/framework-handoff/README.md',
  'examples/framework-handoff/openai_agents.py',
  'examples/framework-handoff/langchain.py',
  'examples/framework-handoff/crewai.py',
  'examples/framework-handoff/autogen.py',
  'examples/framework-handoff/google_adk_a2a.py'
];
for (const rel of required) ok(`required:${rel}`, fs.existsSync(path.join(root, rel)));

if (!failures.length) {
  const agent = json('web/.well-known/agent.json');
  const adapter = json('adapters/a2a/agent-card.json');
  const mcp = json('web/.well-known/mcp.json');
  const wrangler = json('wrangler.jsonc');
  const interoperability = read('cloudflare/src/interoperability.js');
  const affiliate = read('cloudflare/src/affiliate.js');
  const passport = read('cloudflare/src/passport-product.js');
  const alertAdapters = read('cloudflare/src/alert-adapters.js');
  const controlPlane = read('cloudflare/src/control-plane.js');
  const controlPlaneHardening = read('cloudflare/src/control-plane-hardening.js');
  const deploy = read('.github/workflows/deploy-accordtrace.yml');
  const ci = read('.github/workflows/ci.yml');
  const liveWorkflow = read('.github/workflows/accordtrace-live-contract.yml');
  const liveContract = read('scripts/accordtrace-live-contract.mjs');
  const campaign = read('docs/PASSPORT_LAUNCH_CAMPAIGN.md');
  const frameworkReadme = read('examples/framework-handoff/README.md');
  const readme = read('README.md');
  const llmsInstall = read('llms-install.md');

  ok('a2a:cards-synchronized', JSON.stringify(agent) === JSON.stringify(adapter));
  ok('a2a:version-1.0', agent.supportedInterfaces?.[0]?.protocolVersion === '1.0');
  ok('a2a:canonical-url', agent.supportedInterfaces?.[0]?.url === `${HOST}/a2a`);
  ok('a2a:canonical-and-legacy-card-routes', interoperability.includes('url.pathname === "/.well-known/agent-card.json"') && interoperability.includes('url.pathname === "/.well-known/agent.json"'));
  ok('a2a:runtime-dual-methods', interoperability.includes('SendMessage|message\\/send'));
  ok('a2a:live-contract-dual-methods', liveContract.includes("const A2A_METHODS = ['message/send', 'SendMessage']"));
  ok('a2a:live-contract-version-negotiation', liveContract.includes("'A2A-Version': '1.0'"));
  ok('a2a:live-contract-read-only-action', liveContract.includes("action: 'network_capabilities'"));
  ok('a2a:live-contract-both-success-required', liveContract.includes('for (const method of A2A_METHODS)') && liveContract.includes('for (const probe of probes) validateA2AProbe'));
  ok('a2a:live-contract-semantic-equivalence', liveContract.includes('A2A message/send and SendMessage returned different network policy semantics'));
  ok('a2a:live-contract-policy-boundary', ['single_level_direct_product_referral','amount_atomic === 200','amount_atomic === 100','cash_payouts_enabled === false','no_multilevel_downline_commission','no_self_referral'].every((marker) => liveContract.includes(marker)));
  ok('a2a:live-contract-post-deploy', liveWorkflow.includes('workflow_run:') && liveWorkflow.includes('Deploy AccordTrace production') && liveWorkflow.includes("workflow_run.conclusion == 'success'") && liveWorkflow.includes('workflow_run.head_sha'));
  ok('accordtrace:version', agent.version === VERSION && mcp.version === VERSION);

  const expectedSkills = [
    'notarize_evidence', 'verify_proof', 'get_proof', 'hash_content',
    'network_capabilities', 'network_stats', 'passport_product_capabilities', 'resolve_referral'
  ];
  const actualSkills = (agent.skills || []).map((skill) => skill.id).sort();
  ok('a2a:eight-current-skills', actualSkills.length === 8 && expectedSkills.every((id) => actualSkills.includes(id)), actualSkills.join(','));

  ok('mcp:registry-id', mcp.registry?.server === MCP_ID);
  ok('mcp:streamable-http', mcp.transport === 'streamable-http');
  ok('mcp:canonical-url', mcp.url === `${HOST}/mcp`);
  ok('mcp:cline-install-explicit-streamable-http',
    readme.includes('"type": "streamableHttp"') &&
    llmsInstall.includes('"type": "streamableHttp"') &&
    readme.includes(`${HOST}/mcp`) &&
    llmsInstall.includes(`${HOST}/mcp`));
  ok('mcp:cline-install-conservative-auto-approval',
    readme.includes('"autoApprove": []') && llmsInstall.includes('"autoApprove": []'));
  ok('mcp:cline-install-remote-truth-boundary',
    /canonical MCP service is hosted remotely/i.test(llmsInstall) &&
    /Do not invent an `npx`, `uvx`, Docker or stdio command/i.test(llmsInstall));

  ok('runtime:worker-v2', wrangler.main === 'cloudflare/src/worker-v2.js');
  ok('runtime:passport-price-bound', wrangler.vars?.STRIPE_PRICE_AGENT_PASSPORT === PASSPORT_PRICE);
  for (const secret of ['STRIPE_SECRET_KEY', 'STRIPE_WEBHOOK_SECRET', 'NOTARY_PRIVATE_JWK']) {
    ok(`secrets:${secret}-not-plaintext-var`, !Object.prototype.hasOwnProperty.call(wrangler.vars || {}, secret));
  }

  for (const marker of ['agent_passport_certificate', 'STRIPE_PRICE_AGENT_PASSPORT', 'STRIPE_WEBHOOK_SECRET', 'NOTARY_PRIVATE_JWK']) {
    ok(`passport:${marker}`, passport.includes(marker));
  }
  for (const marker of ['single_level_direct_product_referral', 'no_multilevel_downline_commission', 'self_referral_not_allowed', 'cash_payouts_enabled:false']) {
    ok(`affiliate:${marker}`, affiliate.includes(marker));
  }
  ok('economics:us2-passport', campaign.includes('US$2'));
  ok('economics:us1-direct-referral', campaign.includes('US$1'));
  ok('economics:one-level-only', /one[ -]level/i.test(campaign) && /no (multilevel|downline)/i.test(campaign));

  for (const type of ['webhook', 'slack_webhook', 'email_relay']) {
    ok(`control-plane:alert-adapter:${type}`, alertAdapters.includes(`'${type}'`) && controlPlane.includes(`'${type}'`) && controlPlaneHardening.includes(`'${type}'`));
  }
  ok('control-plane:alert-payload-redacted', alertAdapters.includes('contains_secrets:false') && !alertAdapters.includes('payment_payload') && !alertAdapters.includes('private_key'));
  ok('control-plane:shared-adapter-layer', controlPlane.includes('prepareAlertDelivery') && controlPlaneHardening.includes('prepareAlertDelivery'));
  ok('control-plane:hardened-alert-hmac', controlPlaneHardening.includes('x-accordtrace-signature') && controlPlaneHardening.includes('hmacSha256Hex'));
  ok('control-plane:bounded-alert-retry', controlPlaneHardening.includes('MAX_ATTEMPTS=5') && controlPlaneHardening.includes('RETRY_SECONDS=[60,300,1800,7200,21600]') && controlPlaneHardening.includes('dead_letter'));

  ok('frameworks:ci-gated', ci.includes('npm run frameworks:audit') && ci.includes('examples/framework-handoff'));
  ok('frameworks:canonical-discovery', frameworkReadme.includes(MCP_ID) && frameworkReadme.includes(`${HOST}/.well-known/agent-card.json`));
  for (const name of ['OpenAI Agents SDK', 'LangChain', 'CrewAI', 'AutoGen', 'Google ADK']) {
    ok(`frameworks:${name.toLowerCase().replaceAll(' ', '-')}`, frameworkReadme.includes(name));
  }

  ok('deploy:migrations-before-worker', deploy.includes('d1 migrations apply') && deploy.includes('wrangler@latest deploy') && deploy.indexOf('d1 migrations apply') < deploy.indexOf('wrangler@latest deploy'));
  ok('deploy:exact-sha-verification', deploy.includes('EXPECTED_RELEASE_SHA') && deploy.includes('smoke:production'));

  const publicDiscovery = [
    'web/index.html', 'web/passport.html', 'web/network.html', 'web/ai.html',
    'web/llms.txt', 'web/llms-full.txt', 'web/.well-known/agent.json',
    'web/.well-known/mcp.json', 'adapters/a2a/agent-card.json'
  ].map(read).join('\n');
  ok('discovery:no-taskbay-brand-drift', !/TaskBay/i.test(publicDiscovery));
  ok('discovery:no-old-worker-host', !/notary-protocol\.notary-labs\.workers\.dev/i.test(publicDiscovery));
  ok('discovery:canonical-host-present', publicDiscovery.includes(HOST));

  const activation = read('docs/STRIPE_PASSPORT_ACTIVATION.md');
  ok('commerce:fail-closed-truth-boundary', /must not say that checkout or cash payouts are live/i.test(activation));
}

const result = {
  status: failures.length ? 'blocked' : 'ready',
  checks_passed: checks.filter((c) => c.ok).length,
  checks_total: checks.length,
  failures,
  checks
};
console.log(JSON.stringify(result, null, 2));
if (failures.length) process.exitCode = 1;
