import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createSignedAgentRequest, importAgentPrivateJwk } from '../examples/agent-wallet/signed-client.mjs';
import { isolatedBaseUrl, sandboxJson, SandboxHttpError } from './lib/wallet-e2e-http.mjs';

const command = process.argv[2];
if (command === 'prepare') await prepare(process.argv[3], process.argv[4]);
else if (command === 'run') await run(process.argv[3], process.argv[4]);
else throw new Error('Usage: node scripts/agent-wallet-concurrency-e2e.mjs prepare <keys.json> <seed.sql> | run <baseUrl> <keys.json>');

const IDS = ['ACCORD-AGENT-RACE-A', 'ACCORD-AGENT-RACE-B', 'ACCORD-AGENT-GUARD-A', 'ACCORD-AGENT-GUARD-B'];

async function prepare(keysPath, seedPath) {
  if (!keysPath || !seedPath) throw new Error('prepare requires key and seed paths');
  const agents = [];
  for (const id of IDS) {
    const pair = await crypto.subtle.generateKey({ name: 'Ed25519' }, true, ['sign', 'verify']);
    agents.push({ id, privateJwk: await crypto.subtle.exportKey('jwk', pair.privateKey), publicPem: await publicPem(pair.publicKey) });
  }
  fs.writeFileSync(keysPath, JSON.stringify({ agents: agents.map(({ id, privateJwk }) => ({ id, privateJwk })) }), { mode: 0o600 });
  const now = new Date().toISOString();
  const policies = [
    `INSERT INTO wallet_policies (id,version,status,single_transaction_limit_atomic,daily_spending_limit_atomic,rolling_24h_limit_atomic,guardian_approval_above_atomic,allowed_assets_json,allow_unknown_recipients,allow_external_transfer,require_task_link,block_high_risk_destinations,created_at) SELECT 'E2E_CONCURRENCY_V1',version,status,100000000,1000000000,1000000000,100000000,allowed_assets_json,allow_unknown_recipients,allow_external_transfer,require_task_link,block_high_risk_destinations,created_at FROM wallet_policies WHERE id='STANDARD_AUTONOMOUS_V1';`,
    `INSERT INTO wallet_policies (id,version,status,single_transaction_limit_atomic,daily_spending_limit_atomic,rolling_24h_limit_atomic,guardian_approval_above_atomic,allowed_assets_json,allow_unknown_recipients,allow_external_transfer,require_task_link,block_high_risk_destinations,created_at) SELECT 'E2E_GUARDIAN_RACE_V1',version,status,100000000,1000000000,1000000000,50000000,allowed_assets_json,allow_unknown_recipients,allow_external_transfer,require_task_link,block_high_risk_destinations,created_at FROM wallet_policies WHERE id='STANDARD_AUTONOMOUS_V1';`
  ];
  const passports = agents.map(({ id, publicPem }) => `INSERT INTO agent_passports(id,public_key,last_signed_at,created_at,updated_at) VALUES('${escapeSql(id)}','${escapeSql(publicPem)}','${now}','${now}','${now}');`);
  fs.writeFileSync(seedPath, [...policies, ...passports].join('\n'), { mode: 0o600 });
  console.log(JSON.stringify({ prepared: true, agent_ids: IDS, private_keys_logged: false }));
}

async function run(baseUrl, keysPath) {
  const report = { status: 'running', checks: [], real_funds: false, credit_or_lending: false, concurrency: true };
  let base, operatorToken;
  const check = async (name, fn) => {
    try { const value = await fn(); report.checks.push({ name, ok: true }); return value; }
    catch (error) { report.checks.push({ name, ok: false, ...safeFailure(error) }); throw error; }
  };
  const http = (factory, expected = [200, 201]) => sandboxJson(factory, { expected, maxAttempts: 3, retryDelayMs: 1000 });
  try {
    base = isolatedBaseUrl(baseUrl);
    operatorToken = String(process.env.WALLET_E2E_OPERATOR_TOKEN || '');
    assert.ok(operatorToken.length >= 24);
    const stored = JSON.parse(fs.readFileSync(keysPath, 'utf8'));
    const agents = new Map();
    for (const entry of stored.agents || []) agents.set(entry.id, { id: entry.id, privateKey: await importAgentPrivateJwk(entry.privateJwk) });
    for (const id of IDS) assert.ok(agents.get(id));
    const raceA = agents.get(IDS[0]), raceB = agents.get(IDS[1]), guardA = agents.get(IDS[2]), guardB = agents.get(IDS[3]);
    report.base_url = base.origin;
    report.agents = IDS;

    const signed = (agent, path, options = {}, expected) => http(() => createSignedAgentRequest({ baseUrl: base.origin, passportId: agent.id, privateKey: agent.privateKey, path, ...options }), expected);
    const wallet = (agent, policyId) => signed(agent, '/api/v1/agent/wallet', { method: 'POST', body: { policyId } });
    const pay = (from, to, amount, key, expected = [200, 201]) => signed(from, '/api/v1/agent/payments', {
      method: 'POST', idempotencyKey: key,
      body: { recipientAgentId: to.id, amount, asset: 'USDC', purpose: 'AGENT_TASK_SETTLEMENT', taskId: key }
    }, expected);
    const adminApprove = (paymentId, expected = [200]) => http(() => new Request(new URL(`/api/v1/wallet-admin/payments/${encodeURIComponent(paymentId)}/approve`, base), {
      method: 'POST', headers: { authorization: `Bearer ${operatorToken}`, 'content-type': 'application/json' },
      body: JSON.stringify({ reason: 'concurrent Guardian approval e2e' })
    }), expected);
    const balance = async agent => {
      const body = await signed(agent, '/api/v1/agent/wallet/balance');
      const row = body.balances?.find(x => x.asset === 'USDC');
      assert.ok(row); return row;
    };
    const txs = agent => signed(agent, '/api/v1/agent/transactions?limit=100');

    await check('create independent wallets for concurrent agent tests', async () => {
      const created = await Promise.all([
        wallet(raceA, 'E2E_CONCURRENCY_V1'), wallet(raceB, 'E2E_CONCURRENCY_V1'),
        wallet(guardA, 'E2E_GUARDIAN_RACE_V1'), wallet(guardB, 'E2E_GUARDIAN_RACE_V1')
      ]);
      const ids = created.map(x => x.wallet?.id);
      assert.equal(new Set(ids).size, 4);
      assert.ok(created.every(x => x.wallet?.status === 'ACTIVE' && x.wallet?.settlementMode === 'simulated'));
    });

    await check('two simultaneous distinct payments cannot overspend one funded balance', async () => {
      const results = await Promise.all([
        pay(raceA, raceB, '70', 'race-distinct-0001', [201, 409, 422]),
        pay(raceA, raceB, '70', 'race-distinct-0002', [201, 409, 422])
      ]);
      const confirmed = results.filter(x => x.payment?.status === 'CONFIRMED');
      const rejected = results.filter(x => ['INSUFFICIENT_BALANCE', 'BALANCE_RACE_DETECTED'].includes(x.error?.code));
      assert.equal(confirmed.length, 1);
      assert.equal(rejected.length, 1);
      const a = await balance(raceA), b = await balance(raceB);
      assert.equal(a.available, '30'); assert.equal(b.available, '170');
      assert.equal(BigInt(a.authoritativeAtomic.available) + BigInt(b.authoritativeAtomic.available), 200000000n);
      const out = await txs(raceA); assert.equal(out.transactions?.length, 1); assert.equal(out.transactions[0].amount, '70');
    });

    await check('two simultaneous identical idempotency keys move money at most once', async () => {
      const results = await Promise.all([
        pay(raceA, raceB, '10', 'race-same-key-0001', [200, 201, 409]),
        pay(raceA, raceB, '10', 'race-same-key-0001', [200, 201, 409])
      ]);
      assert.ok(results.every(x => x.payment?.status === 'CONFIRMED' || x.idempotentReplay === true || ['IDEMPOTENCY_RACE', 'PAYMENT_STATE_CONFLICT'].includes(x.error?.code)));
      assert.ok(results.some(x => x.payment?.status === 'CONFIRMED'));
      const a = await balance(raceA), b = await balance(raceB);
      assert.equal(a.available, '20'); assert.equal(b.available, '180');
      assert.equal(BigInt(a.authoritativeAtomic.available) + BigInt(b.authoritativeAtomic.available), 200000000n);
      const out = await txs(raceA);
      assert.equal(out.transactions?.length, 2);
      assert.deepEqual(out.transactions.map(x => x.amount).sort(), ['10', '70']);
    });

    const pending = await check('Guardian-race payment remains pending before authorization', async () => {
      const result = await pay(guardA, guardB, '60', 'guardian-race-0001', [202]);
      assert.equal(result.payment?.status, 'APPROVAL_REQUIRED');
      assert.equal((await balance(guardA)).available, '100'); assert.equal((await balance(guardB)).available, '100');
      return result.payment.id;
    });

    await check('two simultaneous Guardian approvals cannot double-settle one payment', async () => {
      const results = await Promise.all([
        adminApprove(pending, [200, 409]),
        adminApprove(pending, [200, 409])
      ]);
      assert.ok(results.every(x => x.payment?.status === 'CONFIRMED' || x.idempotentReplay === true || ['GUARDIAN_APPROVAL_STATE_CONFLICT', 'GUARDIAN_STATE_CONFLICT'].includes(x.error?.code)));
      assert.ok(results.some(x => x.payment?.status === 'CONFIRMED'));
      assert.ok(results.every(x => x.creditCreated !== true));
      const a = await balance(guardA), b = await balance(guardB);
      assert.equal(a.available, '40'); assert.equal(b.available, '160');
      assert.equal(BigInt(a.authoritativeAtomic.available) + BigInt(b.authoritativeAtomic.available), 200000000n);
      const out = await txs(guardA); assert.equal(out.transactions?.length, 1); assert.equal(out.transactions[0].amount, '60');
    });

    await check('concurrent scenarios preserve non-negative and zero-reserved balances', async () => {
      for (const agent of [raceA, raceB, guardA, guardB]) {
        const row = await balance(agent);
        assert.ok(BigInt(row.authoritativeAtomic.available) >= 0n);
        assert.equal(row.authoritativeAtomic.reserved, '0');
      }
    });

    report.status = 'passed';
  } catch (error) {
    report.status = 'failed'; report.failure = safeFailure(error); process.exitCode = 1;
  } finally {
    report.completed_at = new Date().toISOString();
    console.log(JSON.stringify(report, null, 2));
  }
}

async function publicPem(publicKey) {
  const b64 = Buffer.from(await crypto.subtle.exportKey('spki', publicKey)).toString('base64');
  return `-----BEGIN PUBLIC KEY-----\n${b64.match(/.{1,64}/g).join('\n')}\n-----END PUBLIC KEY-----`;
}
function escapeSql(value) { return String(value).replaceAll("'", "''"); }
function safeFailure(error) {
  if (error instanceof SandboxHttpError) return { code: error.code, http_status: error.status, attempts: error.attempts };
  return { code: error?.code === 'ERR_ASSERTION' ? 'ASSERTION_FAILED' : 'E2E_EXECUTION_FAILED' };
}
