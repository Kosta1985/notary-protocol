import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { buildStats, handleStats } from '../src/stats.js';
import { recordAggregateEvent } from '../src/telemetry.js';

const rows = [
  { day: '2026-09-04', event: 'proof_created', count: 2 },
  { day: '2026-09-05', event: 'proof_created', count: 3 },
  { day: '2026-09-05', event: 'a2a_request', count: 4 },
  { day: '2026-09-05', event: 'mcp_request', count: 7 },
  { day: '2026-09-05', event: 'proof_verify_valid', count: 1 }
];

test('modern stats aggregate 30-day events without inventing unique agents', () => {
  const stats = buildStats(rows, { total: 12, synthetic: 5 });
  assert.equal(stats.service, 'Accord Trace');
  assert.equal(stats.windowDays, 30);
  assert.equal(stats.totals.proof_created, 5);
  assert.equal(stats.protocols.a2a_requests, 4);
  assert.equal(stats.protocols.mcp_requests, 7);
  assert.deepEqual(stats.proofs, {
    records_total: 12,
    synthetic_monitor_records: 5,
    non_synthetic_records: 7
  });
  assert.equal(stats.daily.length, 2);
  assert.match(stats.privacy, /No IP addresses, user identifiers, or fabricated unique-agent counts/);
});

test('GET /api/v1/stats reads analytics and proof record totals', async () => {
  const db = {
    prepare(sql) {
      if (sql.includes('FROM analytics_daily')) return { all: async () => ({ results: rows }) };
      if (sql.includes("FROM receipts WHERE deal_id = 'accordtrace-proof-v1'")) return { first: async () => ({ total: 9, synthetic: 4 }) };
      throw new Error(`unexpected SQL: ${sql}`);
    }
  };
  const request = new Request('https://accordtrace.test/api/v1/stats');
  const response = await handleStats(request, { DB: db }, new URL(request.url));
  assert.equal(response.status, 200);
  const body = await response.json();
  assert.equal(body.proofs.records_total, 9);
  assert.equal(body.proofs.synthetic_monitor_records, 4);
  assert.equal(body.proofs.non_synthetic_records, 5);
});

test('internal monitoring requests are excluded while normal fixed events are recorded', async () => {
  const inserted = [];
  const env = {
    DB: {
      prepare() {
        return {
          bind(event) {
            return { run: async () => { inserted.push(event); } };
          }
        };
      }
    }
  };

  await recordAggregateEvent(env, 'a2a_request', new Request('https://accordtrace.test/a2a', { headers: { 'x-notary-monitor': 'live-smoke' } }));
  await recordAggregateEvent(env, 'mcp_request', new Request('https://accordtrace.test/mcp'));
  await recordAggregateEvent(env, 'attacker_controlled_event', new Request('https://accordtrace.test/'));
  assert.deepEqual(inserted, ['mcp_request']);
});

test('production wrapper owns modern stats and protocol telemetry before legacy fallback', () => {
  const source = fs.readFileSync(new URL('../src/worker-v2.js', import.meta.url), 'utf8');
  assert.match(source, /handleStats\(request, env, url\)/);
  assert.match(source, /recordAggregateEvent\(env, \"a2a_request\", request\)/);
  assert.match(source, /recordAggregateEvent\(env, \"mcp_request\", request\)/);
  assert.match(source, /proof_created/);
  assert.match(source, /proof_verify_valid/);
  assert.ok(source.indexOf('handleStats(request, env, url)') < source.indexOf('coreWorker.fetch(request, coreEnv, ctx)'));
});
