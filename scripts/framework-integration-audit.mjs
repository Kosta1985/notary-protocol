import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const failures = [];
const checks = [];
const HOST = 'https://accordtrace.notary-labs.workers.dev';
const MCP_REGISTRY = 'io.github.Kosta1985/accord-trace';

function read(rel) { return fs.readFileSync(path.join(root, rel), 'utf8'); }
function exists(rel) { return fs.existsSync(path.join(root, rel)); }
function ok(name, condition, detail = '') {
  checks.push({ name, ok: Boolean(condition), detail: detail || undefined });
  if (!condition) failures.push(detail ? `${name}: ${detail}` : name);
}
function containsAll(source, markers) { return markers.every((marker) => source.includes(marker)); }

const required = [
  'examples/framework-handoff/common.py',
  'examples/framework-handoff/openai_agents.py',
  'examples/framework-handoff/langchain.py',
  'examples/framework-handoff/crewai.py',
  'examples/framework-handoff/autogen.py',
  'examples/framework-handoff/google_adk_a2a.py',
  'examples/framework-handoff/README.md',
  'examples/agent-handoff/openai.mjs',
  'examples/agent-handoff/claude.mjs',
  'examples/agent-handoff/mcp.mjs',
  'examples/agent-handoff/a2a.mjs'
];
for (const rel of required) ok(`required:${rel}`, exists(rel));

if (!failures.length) {
  const common = read('examples/framework-handoff/common.py');
  const openai = read('examples/framework-handoff/openai_agents.py');
  const langchain = read('examples/framework-handoff/langchain.py');
  const crewai = read('examples/framework-handoff/crewai.py');
  const autogen = read('examples/framework-handoff/autogen.py');
  const google = read('examples/framework-handoff/google_adk_a2a.py');
  const readme = read('examples/framework-handoff/README.md');
  const all = [common, openai, langchain, crewai, autogen, google, readme].join('\n');

  ok('common:canonical-host', common.includes(HOST));
  ok('common:synthetic-data', common.includes('synthetic'));
  ok('common:telemetry-excluded', common.includes('x-accordtrace-telemetry') && common.includes('exclude'));
  ok('common:create-before-handoff', containsAll(common, ['create_evidence', 'create_proof', '/api/v1/proofs']));

  ok('openai:streamable-http-mcp', containsAll(openai, ['MCPServerStreamableHttp', 'accord_trace_verify', 'create_proof', 'verification_prompt']));
  ok('langchain:http-mcp', containsAll(langchain, ['MultiServerMCPClient', '"transport": "http"', 'accord_trace_verify', 'create_proof']));
  ok('crewai:streamable-http-mcp', containsAll(crewai, ['MCPServerAdapter', 'streamable-http', 'accord_trace_verify', 'create_proof']));
  ok('autogen:streamable-http-mcp', containsAll(autogen, ['StreamableHttpServerParams', 'mcp_server_tools', 'accord_trace_verify', 'create_proof']));
  ok('google:a2a-v1-structured-action', containsAll(google, ['create_client', 'SendMessageRequest', 'Part(', '"action": "verify_proof"', '"valid"', '"hash_match"']));

  for (const [name, source] of Object.entries({ openai, langchain, crewai, autogen, google })) {
    ok(`${name}:proof-created-before-verification`, source.indexOf('create_proof(') >= 0 && source.indexOf('create_proof(') < Math.max(source.indexOf('verification_prompt('), source.indexOf('"action": "verify_proof"')));
  }

  ok('readme:mcp-registry', readme.includes(MCP_REGISTRY));
  ok('readme:canonical-agent-card', readme.includes(`${HOST}/.well-known/agent-card.json`));
  ok('readme:no-endorsement-claim', /not endorsement/i.test(readme) && /not evidence of adoption/i.test(readme));
  ok('readme:framework-matrix', ['OpenAI Agents SDK', 'LangChain', 'CrewAI', 'AutoGen', 'Google ADK'].every((name) => readme.includes(name)));

  const secretPatterns = [
    /sk-[A-Za-z0-9_-]{16,}/,
    /rk_[A-Za-z0-9_-]{16,}/,
    /whsec_[A-Za-z0-9_-]{16,}/,
    /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/
  ];
  ok('safety:no-secret-material', !secretPatterns.some((pattern) => pattern.test(all)));
}

const result = {
  status: failures.length ? 'blocked' : 'ready',
  checks_passed: checks.filter((check) => check.ok).length,
  checks_total: checks.length,
  failures,
  checks
};

console.log(JSON.stringify(result, null, 2));
if (failures.length) process.exitCode = 1;
