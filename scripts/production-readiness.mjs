import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const problems = [];
const notes = [];

const requiredFiles = [
  'wrangler.jsonc',
  'cloudflare/src/worker.js',
  'cloudflare/src/worker-v2.js',
  'cloudflare/src/interoperability.js',
  'cloudflare/src/proofs.js',
  'cloudflare/src/affiliate.js',
  'cloudflare/src/affiliate-growth.js',
  'cloudflare/src/passport-product.js',
  'adapters/a2a/agent-card.json',
  'web/index.html',
  'web/passport.html',
  'web/passport.js',
  'web/verify.html',
  'web/dashboard.html',
  'web/validation.html',
  'web/developers.html',
  'web/agents.html',
  'web/network.html',
  'web/checkout-success.html',
  'web/passport-checkout-success.html',
  'web/ai.html',
  'web/llms.txt',
  'web/llms-full.txt',
  'web/robots.txt',
  'web/sitemap.xml',
  'web/.well-known/agent.json',
  'web/.well-known/mcp.json',
  'scripts/live-agent-check.mjs',
  '.github/workflows/deploy-accordtrace.yml',
  '.github/workflows/live-smoke.yml',
  '.github/workflows/accord-trace-agent-smoke.yml'
];
for (const file of requiredFiles) {
  if (!fs.existsSync(path.join(root, file))) problems.push(`missing:${file}`);
}

const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');
const parseJson = (file, code) => {
  try { return JSON.parse(read(file)); }
  catch { problems.push(`${code}:${file}`); return null; }
};

const migDir = path.join(root, 'cloudflare/migrations');
const migrations = fs.readdirSync(migDir).filter((name) => /^\d{4}_.+\.sql$/.test(name)).sort();
for (let i = 0; i < migrations.length; i += 1) {
  const expected = String(i + 1).padStart(4, '0');
  if (!migrations[i].startsWith(`${expected}_`)) problems.push(`migration_sequence:${expected}:${migrations[i]}`);
}
if (migrations.length < 21) problems.push(`migration_count:${migrations.length}:expected_at_least_21`);

const worker = read('cloudflare/src/worker.js');
for (const marker of ['handleValidation','handleValidationDns','handlePaymentHardening','handleIdentityHardening','handleReputationHardening','handleLaunch','handleDeveloper','handleAgentContinuity','runContinuityScheduled','handleAffiliate','matureAffiliateCommissions']) {
  if (!worker.includes(marker)) problems.push(`worker_route_missing:${marker}`);
}

const workerV2 = read('cloudflare/src/worker-v2.js');
for (const marker of ['handleInteroperability','handleProofs','coreWorker.fetch','coreWorker.scheduled']) {
  if (!workerV2.includes(marker)) problems.push(`worker_v2_missing:${marker}`);
}
if (workerV2.indexOf('handleInteroperability') > workerV2.indexOf('coreWorker.fetch')) problems.push('worker_v2_interoperability_order_invalid');

const interoperability = read('cloudflare/src/interoperability.js');
for (const marker of [
  '2026-07-28',
  'accord_trace_verify',
  'accord_trace_create_proof',
  'accord_trace_network_capabilities',
  'accord_trace_network_stats',
  'accord_trace_passport_product_capabilities',
  'accord_trace_resolve_referral',
  'handleAffiliateGrowth',
  'handlePassportProduct',
  'TASK_STATE_COMPLETED',
  'SendMessage'
]) {
  if (!interoperability.includes(marker)) problems.push(`interoperability_missing:${marker}`);
}

const proofs = read('cloudflare/src/proofs.js');
for (const marker of ['service_recorded_hash','issuer_signed_hash','accordtrace.proof.v1','INSERT INTO receipts']) {
  if (!proofs.includes(marker)) problems.push(`proof_runtime_missing:${marker}`);
}

const wranglerText = read('wrangler.jsonc');
let wrangler = null;
try { wrangler = JSON.parse(wranglerText); }
catch { problems.push('wrangler_json_invalid'); }
if (wrangler?.main !== 'cloudflare/src/worker-v2.js') problems.push(`wrangler_main_invalid:${wrangler?.main || 'missing'}`);
const workerFirst = new Set(wrangler?.assets?.run_worker_first || []);
for (const route of ['/api/v1/continuity/*','/api/v1/network/*','/api/v1/passport-product/*','/api/v1/proofs*','/api/v1/hash','/api/v1/verify','/a2a','/mcp','/.well-known/*']) {
  if (!workerFirst.has(route)) problems.push(`worker_first_route_missing:${route}`);
}
if (!(wrangler?.triggers?.crons || []).includes('*/5 * * * *')) problems.push('continuity_cron_missing');

const agentCard = parseJson('web/.well-known/agent.json', 'agent_card_json_invalid');
const adapterCard = parseJson('adapters/a2a/agent-card.json', 'adapter_agent_card_json_invalid');
if (agentCard && adapterCard && JSON.stringify(agentCard) !== JSON.stringify(adapterCard)) problems.push('agent_card_adapter_drift');
if (agentCard) {
  if (agentCard.name !== 'Accord Trace') problems.push(`agent_card_name_invalid:${agentCard.name || 'missing'}`);
  if (agentCard.supportedInterfaces?.[0]?.protocolVersion !== '1.0') problems.push('agent_card_a2a_version_invalid');
  if (!agentCard.supportedInterfaces?.[0]?.url?.endsWith('/a2a')) problems.push('agent_card_a2a_url_invalid');
  for (const skill of ['notarize_evidence','verify_proof','network_capabilities','network_stats','passport_product_capabilities','resolve_referral']) {
    if (!agentCard.skills?.some((candidate) => candidate.id === skill)) problems.push(`agent_card_skill_missing:${skill}`);
  }
}

const mcpManifest = parseJson('web/.well-known/mcp.json', 'mcp_manifest_json_invalid');
if (mcpManifest) {
  if (mcpManifest.name !== 'Accord Trace') problems.push(`mcp_manifest_name_invalid:${mcpManifest.name || 'missing'}`);
  if (mcpManifest.transport !== 'streamable-http') problems.push(`mcp_transport_invalid:${mcpManifest.transport || 'missing'}`);
  if (!String(mcpManifest.url || '').endsWith('/mcp')) problems.push('mcp_url_invalid');
  if (mcpManifest.registry?.server !== 'io.github.Kosta1985/accord-trace') problems.push('mcp_registry_identity_invalid');
}

const launch = read('cloudflare/src/launch.js');
if (!launch.includes('handleStripe')) problems.push('launch_route_missing:handleStripe');

const affiliate = read('cloudflare/src/affiliate.js');
for (const marker of ['single_level_direct_product_referral','no_multilevel_downline_commission','self_referral_not_allowed','shared_payment_identity_review','cash_payouts_enabled:false']) {
  if (!affiliate.includes(marker)) problems.push(`affiliate_boundary_missing:${marker}`);
}

const passportProduct = read('cloudflare/src/passport-product.js');
for (const marker of ['agent_passport_certificate','STRIPE_PRICE_AGENT_PASSPORT','STRIPE_WEBHOOK_SECRET','NOTARY_PRIVATE_JWK']) {
  if (!passportProduct.includes(marker)) problems.push(`passport_product_gate_missing:${marker}`);
}

const home = read('web/index.html');
for (const marker of ['Know which agent you are dealing with','Agent Passport Certificate','US$2','US$1','/passport.html','/network.html','checkout remains fail-closed']) {
  if (!home.toLowerCase().includes(marker.toLowerCase())) problems.push(`commercial_home_marker_missing:${marker}`);
}
if (/TaskBay's portable evidence layer/.test(home)) problems.push('stale_taskbay_positioning');

const passportPage = read('web/passport.html');
for (const marker of ['Sample Agent Passport Certificate','SAMPLE','agent_passport_certificate','Ed25519','US$2.00','US$1','not legal identity, KYC','/api/v1/passport-product/capabilities']) {
  if (!passportPage.toLowerCase().includes(marker.toLowerCase())) problems.push(`passport_page_missing:${marker}`);
}
const passportUi = read('web/passport.js');
for (const marker of ['product.commercial_ready','Stripe activation in progress','aria-disabled','/api/v1/network/referrals/']) {
  if (!passportUi.includes(marker)) problems.push(`passport_ui_missing:${marker}`);
}

const network = read('web/network.html');
for (const marker of ['US$2 Agent Passport Certificate','US$1 qualifying commission','One level only','No downline','Cash payout rail is not yet enabled','Invitation generation is not a sale']) {
  if (!network.toLowerCase().includes(marker.toLowerCase())) problems.push(`network_page_missing:${marker}`);
}

const ai = read('web/ai.html');
for (const marker of ['application/ld+json','SoftwareApplication','FAQPage','US$2','US$1','key control, not legal identity','no downline commissions','MCP endpoint']) {
  if (!ai.toLowerCase().includes(marker.toLowerCase())) problems.push(`ai_discovery_missing:${marker}`);
}

const llms = read('web/llms.txt');
for (const marker of ['/passport.html','/ai.html','/api/v1/continuity/capabilities','/api/v1/network/capabilities','/mcp','/api/v1/passport-product/capabilities','US$2.00 one time','US$1.00','No multilevel/downline commissions']) {
  if (!llms.includes(marker)) problems.push(`llms_discovery_missing:${marker}`);
}
const full = read('web/llms-full.txt');
for (const marker of ['Missing heartbeat alone never triggers containment','US$2.00 one-time launch price','US$1 direct commission','no multilevel/downline commissions']) {
  if (!full.includes(marker)) problems.push(`llms_full_boundary_missing:${marker}`);
}

const robots = read('web/robots.txt');
if (!robots.includes('Disallow: /api/v1/control-plane/')) problems.push('robots_private_surface_boundary_missing');
const sitemap = read('web/sitemap.xml');
for (const marker of ['/passport.html','/ai.html','/network.html','/llms.txt','/llms-full.txt']) {
  if (!sitemap.includes(marker)) problems.push(`sitemap_missing:${marker}`);
}

const liveAgentCheck = read('scripts/live-agent-check.mjs');
for (const marker of ['rest: "passed"','a2a: "passed"','mcp: "passed"','agent_growth_discovery','affiliate_network','passport_product_safety','accord_trace_network_capabilities','accord_trace_network_stats','accord_trace_passport_product_capabilities']) {
  if (!liveAgentCheck.includes(marker)) problems.push(`live_agent_check_missing:${marker}`);
}

const deploy = read('.github/workflows/deploy-accordtrace.yml');
for (const marker of ['d1 migrations apply','wrangler@latest deploy','CLOUDFLARE_API_TOKEN','EXPECTED_RELEASE_SHA','smoke:production']) {
  if (!deploy.includes(marker)) problems.push(`deploy_marker_missing:${marker}`);
}
if (deploy.indexOf('d1 migrations apply') > deploy.indexOf('wrangler@latest deploy')) problems.push('deploy_migration_order_invalid');

const liveSmoke = read('.github/workflows/live-smoke.yml');
for (const marker of ['workflow_run:','Deploy AccordTrace production',"workflow_run.conclusion == 'success'",'actions/checkout@v7','actions/setup-node@v7','live-agent-check.mjs']) {
  if (!liveSmoke.includes(marker)) problems.push(`live_smoke_missing:${marker}`);
}
if (/\npush:\s*\n/.test(liveSmoke)) problems.push('live_smoke_must_not_race_push_deploy');

const secondarySmoke = read('.github/workflows/accord-trace-agent-smoke.yml');
for (const marker of ['schedule:','workflow_dispatch:','actions/checkout@v7','actions/setup-node@v7','live-agent-check.mjs']) {
  if (!secondarySmoke.includes(marker)) problems.push(`secondary_smoke_missing:${marker}`);
}
if (/\npush:\s*\n/.test(secondarySmoke)) problems.push('secondary_smoke_must_not_race_push_deploy');

const requireCloudflare = process.argv.includes('--require-cloudflare');
const cloudflareToken = process.env.CLOUDFLARE_API_TOKEN || process.env.CF_TOKEN_1 || process.env.CF_TOKEN_2 || process.env.CF_TOKEN_3 || process.env.CF_TOKEN_4;
const cloudflareAccount = process.env.CLOUDFLARE_ACCOUNT_ID || process.env.CF_ACCOUNT_1 || process.env.CF_ACCOUNT_2 || process.env.CF_ACCOUNT_3 || process.env.CF_ACCOUNT_4;
if (requireCloudflare) {
  if (!cloudflareToken) problems.push('env:CLOUDFLARE_API_TOKEN');
  if (!cloudflareAccount) notes.push('Cloudflare account ID will be resolved by deploy workflow when token authorization permits it.');
} else if (!cloudflareToken) {
  notes.push('Cloudflare token not configured in this process; deployment credentials may still be normalized by the deploy workflow.');
}

for (const key of ['STRIPE_SECRET_KEY','STRIPE_WEBHOOK_SECRET','STRIPE_PRICE_DOMAIN_CONTROL','STRIPE_PRICE_PUBLISHER_VALIDATION','STRIPE_PRICE_SECURITY_ASSESSMENT']) {
  if (!process.env[key]) notes.push(`${key} not configured; corresponding Stripe checkout capability remains disabled.`);
}
const passportPriceConfigured = process.env.STRIPE_PRICE_AGENT_PASSPORT || wrangler?.vars?.STRIPE_PRICE_AGENT_PASSPORT;
if (!passportPriceConfigured) notes.push('STRIPE_PRICE_AGENT_PASSPORT not configured; Agent Passport Certificate checkout remains disabled.');
if (!process.env.NOTARY_PRIVATE_JWK) notes.push('NOTARY_PRIVATE_JWK not configured; free proofs use service_recorded_hash and signed Passport Certificate issuance remains disabled.');
if (!process.env.STRIPE_PUBLISHABLE_KEY) notes.push('STRIPE_PUBLISHABLE_KEY is not configured; hosted Checkout does not require it server-side, but retain it for future embedded/client features.');
notes.push('Affiliate cash payouts remain intentionally disabled until payout-provider, KYC/tax and final terms activation.');
if (String(process.env.LIVE_API_KEYS_ENABLED || '').toLowerCase() !== 'true') notes.push('Live developer API keys are disabled; test mode remains available after deployment.');

const result = {
  status: problems.length ? 'blocked' : 'ready',
  runtime: {
    entrypoint: wrangler?.main || null,
    a2a_protocol: agentCard?.supportedInterfaces?.[0]?.protocolVersion || null,
    mcp_transport: mcpManifest?.transport || null,
    agent_growth_tools: ['network_capabilities','network_stats','passport_product_capabilities','resolve_referral'],
    commercial_launch: { product: 'agent_passport_certificate', price_atomic: 200, currency: 'usd', direct_commission_atomic: 100, referral_levels: 1, stripe_price_configured: Boolean(passportPriceConfigured) },
    proof_modes: ['service_recorded_hash','issuer_signed_hash']
  },
  migrations: migrations.length,
  latest_migration: migrations.at(-1) || null,
  problems,
  notes
};
console.log(JSON.stringify(result, null, 2));
if (problems.length) process.exitCode = 1;
