import { readFile } from 'node:fs/promises';

const expected = '0.2.1';
const readJson = async (path) => JSON.parse(await readFile(path, 'utf8'));

const mcp = await readJson('server.json');
const a2a = await readJson('adapters/a2a/agent-card.json');
const openapi = await readJson('docs/openapi.json');

const failures = [];
if (mcp.version !== expected) failures.push(`server.json=${mcp.version}`);
if (a2a.version !== expected) failures.push(`agent-card.json=${a2a.version}`);
if (openapi.info?.version !== expected) failures.push(`openapi.json=${openapi.info?.version}`);
if (mcp.title !== 'Accord Trace') failures.push('server.json title drift');
if (a2a.name !== 'Accord Trace') failures.push('agent card name drift');
if (openapi.info?.title !== 'Accord Trace API') failures.push('OpenAPI title drift');

if (failures.length) {
  console.error(`Accord Trace metadata drift: ${failures.join(', ')}`);
  process.exit(1);
}

console.log(`Accord Trace metadata synchronized at ${expected}`);
