import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const ready = fs.readFileSync(new URL('../scripts/production-readiness.mjs', import.meta.url), 'utf8');
const live = fs.readFileSync(new URL('../scripts/live-agent-check.mjs', import.meta.url), 'utf8');
const runtime = fs.readFileSync(new URL('../cloudflare/src/interoperability.js', import.meta.url), 'utf8');
const webCard = JSON.parse(fs.readFileSync(new URL('../web/.well-known/agent.json', import.meta.url), 'utf8'));
const adapterCard = JSON.parse(fs.readFileSync(new URL('../adapters/a2a/agent-card.json', import.meta.url), 'utf8'));

const tools = [
  'accord_trace_network_capabilities',
  'accord_trace_network_stats',
  'accord_trace_passport_product_capabilities',
  'accord_trace_resolve_referral'
];
const skills = ['network_capabilities', 'network_stats', 'passport_product_capabilities', 'resolve_referral'];

test('growth discovery tools reuse existing policy handlers and stay read-only', () => {
  for (const tool of tools) assert.ok(runtime.includes(tool), `missing runtime tool ${tool}`);
  for (const handler of ['handleAffiliateGrowth', 'handleAffiliate', 'handlePassportProduct']) assert.ok(runtime.includes(handler));
  assert.match(runtime, /readExistingPublicApi/);
  assert.doesNotMatch(runtime, /qualifyDirectAffiliateSale|reverseDirectAffiliateSale|stripePost/);
});

test('A2A cards advertise the same read-only growth skills', () => {
  assert.deepEqual(adapterCard, webCard);
  for (const skill of skills) assert.ok(webCard.skills?.some((candidate) => candidate.id === skill), `missing A2A skill ${skill}`);
});

test('readiness blocks releases that lose agent-native growth discovery', () => {
  for (const tool of tools) assert.ok(ready.includes(tool), `readiness missing ${tool}`);
  for (const skill of skills) assert.ok(ready.includes(skill), `readiness missing skill ${skill}`);
  assert.match(ready, /agent_card_adapter_drift/);
  assert.match(ready, /agent_growth_tools/);
});

test('live black-box calls growth discovery over both A2A and MCP', () => {
  assert.match(live, /a2aAction\("network_capabilities"/);
  for (const tool of ['accord_trace_network_capabilities', 'accord_trace_network_stats', 'accord_trace_passport_product_capabilities']) assert.ok(live.includes(tool));
  assert.match(live, /agent_growth_discovery: "passed"/);
});
