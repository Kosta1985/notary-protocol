import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createSignedAgentRequest, importAgentPrivateJwk, canonicalize } from '../examples/agent-wallet/signed-client.mjs';
import { isolatedBaseUrl, sandboxJson, SandboxHttpError } from './lib/wallet-e2e-http.mjs';

const command = process.argv[2];
if (command === 'prepare') await prepare(process.argv[3], process.argv[4]);
else if (command === 'run') await run(process.argv[3], process.argv[4]);
else throw new Error('Usage: node scripts/agent-wallet-isolated-e2e.mjs prepare <keys.json> <seed.sql> | run <baseUrl> <keys.json>');

async function prepare(keysPath, seedPath) {
  if (!keysPath || !seedPath) throw new Error('prepare requires key and seed paths');
  const agents = [];
  for (const id of ['ACCORD-AGENT-ALPHA', 'ACCORD-AGENT-BETA']) {
    const pair = await crypto.subtle.generateKey({ name: 'Ed25519' }, true, ['sign', 'verify']);
    agents.push({ id, privateJwk: await crypto.subtle.exportKey('jwk', pair.privateKey), publicPem: await publicPem(pair.publicKey) });
  }
  fs.writeFileSync(keysPath, JSON.stringify({ agents: agents.map(({ id, privateJwk }) => ({ id, privateJwk })) }), { mode: 0o600 });
  const now = new Date().toISOString();
  const policySql = `INSERT INTO wallet_policies (id,version,status,single_transaction_limit_atomic,daily_spending_limit_atomic,rolling_24h_limit_atomic,guardian_approval_above_atomic,allowed_assets_json,allow_unknown_recipients,allow_external_transfer,require_task_link,block_high_risk_destinations,created_at) SELECT 'E2E_BALANCE_ISOLATION_V1',version,status,single_transaction_limit_atomic,1000000000,1000000000,guardian_approval_above_atomic,allowed_assets_json,allow_unknown_recipients,allow_external_transfer,require_task_link,block_high_risk_destinations,created_at FROM wallet_policies WHERE id='STANDARD_AUTONOMOUS_V1';`;
  const sql = policySql + '\n' + agents.map(({ id, publicPem }) => `INSERT INTO agent_passports(id,public_key,last_signed_at,created_at,updated_at) VALUES('${escapeSql(id)}','${escapeSql(publicPem)}','${now}','${now}','${now}');`).join('\n');
  fs.writeFileSync(seedPath, sql, { mode: 0o600 });
  console.log(JSON.stringify({ prepared: true, agent_ids: agents.map(x => x.id), private_keys_logged: false }));
}

async function run(baseUrl, keysPath) {
  const report = { status: 'running', checks: [], activation_retries: 0, real_funds: false, credit_or_lending: false };
  let base, operatorToken, alpha, beta;
  const check = async (name, fn) => {
    try {
      const result = await fn();
      report.checks.push({ name, ok: true });
      return result;
    } catch (error) {
      report.checks.push({ name, ok: false, ...safeFailure(error) });
      throw error;
    }
  };
  const http = (factory, expected = [200, 201]) => sandboxJson(factory, {
    expected, onRetry: () => { report.activation_retries++; }
  });
  const get = path => http(() => new Request(new URL(path, base), { headers: { accept: 'application/json' } }));
  const signed = (agent, path, options = {}, expected) => http(() => createSignedAgentRequest({
    baseUrl: base.origin, passportId: agent.id, privateKey: agent.privateKey, path, ...options
  }), expected);
  const admin = (path, expected = [200], authenticated = true) => http(() => new Request(new URL(path, base), {
    method: 'POST', headers: { 'content-type': 'application/json', ...(authenticated ? { authorization: `Bearer ${operatorToken}` } : {}) },
    body: JSON.stringify({ reason: 'isolated signed-agent E2E verification' })
  }), expected);
  const balance = async agent => {
    const payload = await signed(agent, '/api/v1/agent/wallet/balance');
    const row = payload.balances?.find(x => x.asset === 'USDC');
    assert.ok(row);
    assert.match(row.authoritativeAtomic.available, /^\d+$/);
    assert.match(row.authoritativeAtomic.reserved, /^\d+$/);
    return row;
  };
  const balances = async (a, b) => {
    assert.equal((await balance(alpha)).available, a);
    assert.equal((await balance(beta)).available, b);
  };

  try {
    await check('isolated target and ephemeral agent keys', async () => {
      base = isolatedBaseUrl(baseUrl);
      report.base_url = base.origin;
      operatorToken = String(process.env.WALLET_E2E_OPERATOR_TOKEN || '');
      assert.ok(operatorToken.length >= 24);
      const stored = JSON.parse(fs.readFileSync(keysPath, 'utf8'));
      const agents = new Map();
      for (const entry of stored.agents || []) agents.set(entry.id, { id: entry.id, privateKey: await importAgentPrivateJwk(entry.privateJwk) });
      alpha = agents.get('ACCORD-AGENT-ALPHA'); beta = agents.get('ACCORD-AGENT-BETA');
      assert.ok(alpha && beta);
      report.agents = [alpha.id, beta.id];
    });
    await check('machine capability contract', async () => {
      const capabilities = await get('/api/v1/agent/wallet-capabilities');
      assert.equal(capabilities.audience, 'autonomous_agents');
      assert.equal(capabilities.machine_first, true);
      assert.equal(capabilities.wallet_enabled, true);
      assert.equal(capabilities.payments_enabled, true);
      assert.equal(capabilities.payment_contract?.funded_balance_only, true);
      assert.equal(capabilities.payment_contract?.negative_balances, false);
      assert.equal(capabilities.payment_contract?.guardian_approval_creates_funds, false);
      assert.equal(capabilities.credit_and_lending?.enabled, false);
      assert.equal(capabilities.machine_protocols?.mutations_require_direct_passport_signed_request, true);
    });
    await check('unsigned wallet access is rejected', async () => {
      const rejected = await http(() => new Request(new URL('/api/v1/agent/wallet', base)), [401]);
      assert.equal(rejected.error?.code, 'SIGNED_AGENT_REQUEST_REQUIRED');
    });
    const alphaNonce = `e2e_${crypto.randomUUID().replaceAll('-', '')}`;
    const { alphaWallet, betaWallet } = await check('separate simulated agent wallet identities', async () => {
      const a = (await signed(alpha, '/api/v1/agent/wallet', { method: 'POST', body: { policyId: 'E2E_BALANCE_ISOLATION_V1' }, nonce: alphaNonce })).wallet;
      const b = (await signed(beta, '/api/v1/agent/wallet', { method: 'POST', body: {} })).wallet;
      assert.ok(a?.id && b?.id);
      assert.notEqual(a.id, b.id); assert.notEqual(a.walletAddress, b.walletAddress);
      assert.equal(a.status, 'ACTIVE'); assert.equal(b.status, 'ACTIVE');
      assert.equal(a.settlementMode, 'simulated'); assert.equal(b.settlementMode, 'simulated');
      return { alphaWallet: a, betaWallet: b };
    });
    await check('balance test fixture is separate from unchanged standard policy', async () => {
      const a = (await signed(alpha, '/api/v1/agent/wallet/policy')).policy;
      const b = (await signed(beta, '/api/v1/agent/wallet/policy')).policy;
      assert.equal(a.id, 'E2E_BALANCE_ISOLATION_V1');
      assert.equal(a.singleTransactionLimit, '100'); assert.equal(a.guardianApprovalAbove, '50');
      assert.equal(a.dailySpendingLimit, '1000'); assert.equal(a.rolling24hLimit, '1000');
      assert.equal(b.id, 'STANDARD_AUTONOMOUS_V1');
      assert.equal(b.dailySpendingLimit, '100'); assert.equal(b.rolling24hLimit, '100');
      report.policy_fixture = { alpha: a.id, beta: b.id, standard_policy_unchanged: true, reason: 'Separate balance failures from prior daily-budget denial.' };
    });
    await check('signed nonce replay is rejected', async () => {
      const rejected = await signed(alpha, '/api/v1/agent/wallet', { method: 'POST', body: {}, nonce: alphaNonce }, [409]);
      assert.equal(rejected.error?.code, 'REQUEST_REPLAY_DETECTED');
    });
    await check('agent cannot create another agent wallet', async () => {
      const rejected = await signed(alpha, '/api/v1/agent/wallet', { method: 'POST', body: { passportId: beta.id } }, [403]);
      assert.equal(rejected.error?.code, 'CROSS_AGENT_WALLET_ACCESS');
    });
    await check('changed signed body is rejected before execution', async () => {
      const rejected = await http(async () => {
        const request = await createSignedAgentRequest({ baseUrl: base.origin, passportId: alpha.id, privateKey: alpha.privateKey, path: '/api/v1/agent/wallet', method: 'POST', body: {} });
        return new Request(request, { body: JSON.stringify({ passportId: beta.id }) });
      }, [401]);
      assert.equal(rejected.error?.code, 'AGENT_SIGNATURE_INVALID');
    });
    await check('initial simulated funded balances', () => balances('100', '100'));
    const paymentBody = { recipientAgentId: beta.id, amount: '1', asset: 'USDC', purpose: 'AGENT_TASK_SETTLEMENT', taskId: 'e2e-alpha-beta-1' };
    const pay = (amount, key, expected = [200, 201]) => signed(alpha, '/api/v1/agent/payments', {
      method: 'POST', body: { ...paymentBody, amount, taskId: key }, idempotencyKey: key
    }, expected);
    const paid = await check('Alpha pays Beta exactly once from funded balance', async () => {
      const result = await pay('1', 'e2e-alpha-beta-0001');
      assert.equal(result.payment?.status, 'CONFIRMED'); assert.equal(result.payment?.amount, '1');
      await verifyReceipt(result.receipt); await balances('99', '101');
      return result;
    });
    await check('economic idempotency survives fresh signed nonce', async () => {
      const replay = await pay('1', 'e2e-alpha-beta-0001');
      assert.equal(replay.idempotentReplay, true); assert.equal(replay.payment?.id, paid.payment.id);
      await balances('99', '101');
    });
    await check('idempotency key cannot authorize a different amount', async () => {
      const rejected = await pay('2', 'e2e-alpha-beta-0001', [409]);
      assert.equal(rejected.error?.code, 'IDEMPOTENCY_KEY_CONFLICT'); await balances('99', '101');
    });
    await check('hard policy limit blocks oversized payment', async () => {
      const blocked = await pay('1000', 'e2e-hard-limit-0001', [422]);
      assert.equal(blocked.payment?.status, 'BLOCKED');
      assert.equal(blocked.payment?.policy?.code, 'TRANSACTION_LIMIT_EXCEEDED'); await balances('99', '101');
    });
    const pending = await check('high-value payment waits for Guardian without moving funds', async () => {
      const result = await pay('60', 'e2e-guardian-approve-1', [202]);
      assert.equal(result.payment?.status, 'APPROVAL_REQUIRED'); assert.ok(result.payment?.id);
      await balances('99', '101'); return result;
    });
    const approvalPath = `/api/v1/wallet-admin/payments/${encodeURIComponent(pending.payment.id)}/approve`;
    await check('Guardian approval cannot be invoked without operator authorization', async () => {
      const rejected = await admin(approvalPath, [401], false);
      assert.equal(rejected.error?.code, 'GUARDIAN_UNAUTHORIZED'); await balances('99', '101');
    });
    await check('Guardian approval rechecks and settles existing funded balance', async () => {
      const result = await admin(approvalPath);
      assert.equal(result.payment?.status, 'CONFIRMED'); assert.equal(result.creditCreated, false);
      await verifyReceipt(result.receipt); await balances('39', '161');
    });
    await check('Guardian approval is economically idempotent', async () => {
      const result = await admin(approvalPath);
      assert.equal(result.idempotentReplay, true); await balances('39', '161');
    });
    await check('autonomous payment cannot exceed available funded balance', async () => {
      const rejected = await pay('40', 'e2e-insufficient-funds', [422]);
      assert.equal(rejected.error?.code, 'INSUFFICIENT_BALANCE'); await balances('39', '161');
    });
    const deniedPath = await check('Guardian denial moves no funds', async () => {
      const pendingDeny = await pay('60', 'e2e-guardian-deny-01', [202]);
      assert.equal(pendingDeny.payment?.status, 'APPROVAL_REQUIRED');
      const path = `/api/v1/wallet-admin/payments/${encodeURIComponent(pendingDeny.payment.id)}/deny`;
      const denied = await admin(path);
      assert.equal(denied.payment?.status, 'BLOCKED'); await balances('39', '161'); return path;
    });
    await check('Guardian denial is idempotent', async () => {
      assert.equal((await admin(deniedPath)).idempotentReplay, true); await balances('39', '161');
    });
    const unfundedPath = await check('Guardian approval cannot manufacture funds', async () => {
      const unfunded = await pay('60', 'e2e-unfunded-approval', [202]);
      assert.equal(unfunded.payment?.status, 'APPROVAL_REQUIRED');
      const path = `/api/v1/wallet-admin/payments/${encodeURIComponent(unfunded.payment.id)}/approve`;
      const rejected = await admin(path, [422]);
      assert.equal(rejected.error?.code, 'INSUFFICIENT_BALANCE'); await balances('39', '161'); return path;
    });
    await check('Guardian can freeze an autonomous wallet', async () => {
      const frozen = await admin(`/api/v1/wallet-admin/wallets/${encodeURIComponent(alphaWallet.id)}/freeze`);
      assert.equal(frozen.wallet?.status, 'FROZEN');
    });
    await check('freeze also prevents approval of an already pending payment', async () => {
      const rejected = await admin(unfundedPath, [422]);
      assert.equal(rejected.error?.code, 'WALLET_NOT_ACTIVE'); await balances('39', '161');
    });
    await check('frozen agent cannot initiate a new settlement', async () => {
      const rejected = await pay('1', 'e2e-after-freeze-1', [422]);
      assert.equal(rejected.error?.code, 'WALLET_NOT_ACTIVE'); await balances('39', '161');
    });
    await check('economic history stays operational, not credit', async () => {
      const trust = await signed(alpha, '/api/v1/agent/economic-trust');
      assert.equal(trust.walletStatus, 'FROZEN'); assert.match((trust.limitations || []).join(' '), /not a credit score/i);
    });
    await check('both agents can reconcile hash-bound payment receipts', async () => {
      for (const agent of [alpha, beta]) {
        const payload = await signed(agent, '/api/v1/agent/receipts?limit=100');
        assert.ok(Array.isArray(payload.receipts)); assert.ok(payload.receipts.length >= 3);
        assert.ok(payload.receipts.some(x => x.receiptId === paid.receipt.receiptId));
        for (const receipt of payload.receipts) await verifyReceipt(receipt);
      }
    });
    await check('both agents see exactly two confirmed simulated transactions', async () => {
      for (const [agent, direction] of [[alpha, 'OUTGOING'], [beta, 'INCOMING']]) {
        const payload = await signed(agent, '/api/v1/agent/transactions?limit=100');
        assert.equal(payload.transactions?.length, 2);
        assert.deepEqual(payload.transactions.map(x => x.amount).sort(), ['1', '60']);
        for (const tx of payload.transactions) {
          assert.equal(tx.direction, direction); assert.equal(tx.state, 'CONFIRMED');
          assert.equal(tx.transactionHash, null); assert.match(tx.providerTxRef, /^simtx_/);
        }
      }
    });
    await check('conservation of simulated funds and no negative or reserved balance', async () => {
      const a = await balance(alpha), b = await balance(beta);
      assert.equal(BigInt(a.authoritativeAtomic.available) + BigInt(b.authoritativeAtomic.available), 200000000n);
      assert.equal(a.authoritativeAtomic.reserved, '0'); assert.equal(b.authoritativeAtomic.reserved, '0');
      assert.equal(a.available, '39'); assert.equal(b.available, '161');
      report.final_balances = { alpha_usdc: a.available, beta_usdc: b.available, total_atomic: '200000000', simulated: true };
    });
    report.status = 'passed';
  } catch (error) {
    report.status = 'failed'; report.failure = safeFailure(error); process.exitCode = 1;
  } finally {
    report.completed_at = new Date().toISOString();
    console.log(JSON.stringify(report, null, 2));
  }
}

async function verifyReceipt(receipt) {
  assert.ok(receipt?.receiptId); assert.equal(receipt.integrityMode, 'hash_bound_service_record');
  assert.equal(receipt.settlementMode, 'simulated');
  const { payloadHash, ...body } = receipt;
  assert.equal(await digest(canonicalize(body)), payloadHash);
  assert.notEqual(await digest(canonicalize({ ...body, status: 'TAMPERED' })), payloadHash);
}
async function digest(value) { return Buffer.from(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value))).toString('hex'); }
async function publicPem(publicKey) { const b64 = Buffer.from(await crypto.subtle.exportKey('spki', publicKey)).toString('base64'); return `-----BEGIN PUBLIC KEY-----\n${b64.match(/.{1,64}/g).join('\n')}\n-----END PUBLIC KEY-----`; }
function escapeSql(value) { return String(value).replaceAll("'", "''"); }
function safeFailure(error) {
  // Never archive response bodies, key material, authorization headers or raw assertions.
  if (error instanceof SandboxHttpError) return { code: error.code, http_status: error.status, attempts: error.attempts };
  return { code: error?.code === 'ERR_ASSERTION' ? 'ASSERTION_FAILED' : 'E2E_EXECUTION_FAILED' };
}
