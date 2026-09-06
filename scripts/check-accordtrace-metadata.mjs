import { readFile } from 'node:fs/promises';

const expected = '0.2.1';
const readJson = async (path) => JSON.parse(await readFile(path, 'utf8'));

const mcp = await readJson('server.json');
const a2a = await readJson('adapters/a2a/agent-card.json');
const openapi = await readJson('docs/openapi.json');
const webMcp = await readJson('web/.well-known/mcp.json');
const aiCatalog = await readJson('web/.well-known/ai-catalog.json');

const failures = [];
if (mcp.version !== expected) failures.push(`server.json=${mcp.version}`);
if (a2a.version !== expected) failures.push(`agent-card.json=${a2a.version}`);
if (openapi.info?.version !== expected) failures.push(`openapi.json=${openapi.info?.version}`);
if (webMcp.version !== expected) failures.push(`web/.well-known/mcp.json=${webMcp.version}`);
if (mcp.title !== 'Accord Trace') failures.push('server.json title drift');
if (a2a.name !== 'Accord Trace') failures.push('agent card name drift');
if (openapi.info?.title !== 'Accord Trace API') failures.push('OpenAPI title drift');
if (webMcp.name !== 'Accord Trace') failures.push('web MCP name drift');

const requiredSkills = [
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
const a2aSkills = new Set((a2a.skills ?? []).map((skill) => skill.id));
const webMcpCapabilities = new Set(webMcp.capabilities ?? []);
for (const skill of requiredSkills) {
  if (!a2aSkills.has(skill)) failures.push(`agent card missing ${skill}`);
  if (!webMcpCapabilities.has(skill)) failures.push(`web MCP missing ${skill}`);
}

const catalogResources = new Set((aiCatalog.resources ?? []).map((resource) => resource.name));
for (const resourceName of [
  'Accord Trace Agent Passport Certificate',
  'Accord Trace Agent Wallet',
  'Accord Trace Agent Affiliate Network',
  'Accord Trace Network Statistics'
]) {
  if (!catalogResources.has(resourceName)) failures.push(`AI catalog missing ${resourceName}`);
}

if (failures.length) {
  console.error(`Accord Trace metadata drift: ${failures.join(', ')}`);
  process.exit(1);
}

console.log(`Accord Trace metadata synchronized at ${expected}; ${requiredSkills.length} agent capabilities covered.`);
