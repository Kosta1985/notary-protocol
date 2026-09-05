import { authenticateAgentRequest, reserveAgentNonce, parseSignedJson, AgentRequestError, sha256Hex, canonicalize } from './wallet-auth.js';
import { createWalletProvider } from './wallet/providers/accord-test.js';
import { parseAssetAmount, toDbInteger, formatAssetAmount, atomicFromDb } from './wallet/money.js';
import { policyFromRow, evaluateTransactionPolicy, POLICY_DECISIONS } from './wallet/policy.js';
import { buildWalletReceipt, receiptInsert } from './wallet-receipts.js';

const JSON_HEADERS = { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' };
const PAGE_MAX = 100;

export class AgentWalletError extends Error {
  constructor(code, status = 400, message = code, details = null) {
    super(message); this.code = code; this.status = status; this.details = details;
  }
}

export async function handleAgentWallet(request, env, url = new URL(request.url)) {
  if (!url.pathname.startsWith('/api/v1/agent/') && !url.pathname.startsWith('/api/v1/wallet-admin/')) return null;

  if (url.pathname.startsWith('/api/v1/wallet-admin/')) return handleAdmin(request, env, url);
  requireFeature(env, 'FEATURE_AGENT_WALLETS');

  const auth = await authenticateAgentRequest(request, env, url);
  await applyRateLimit(env, auth.passportId, request.method === 'POST' ? 'wallet_write' : 'wallet_read', request.method === 'POST' ? 30 : 180);

  if (request.method === 'POST') await reserveAgentNonce(env, auth);

  if (request.method === 'POST' && url.pathname === '/api/v1/agent/wallet') return createWallet(request, env, auth);
  if (request.method === 'GET' && url.pathname === '/api/v1/agent/wallet') return getWallet(env, auth.passportId);
  if (request.method === 'GET' && url.pathname === '/api/v1/agent/wallet/balance') return getBalance(env, auth.passportId);
  if (request.method === 'GET' && url.pathname === '/api/v1/agent/wallet/policy') return getPolicy(env, auth.passportId);
  if (request.method === 'POST' && url.pathname === '/api/v1/agent/payments') {
    requireFeature(env, 'FEATURE_AGENT_PAYMENTS');
    return createPayment(request, env, auth);
  }
  const paymentMatch = url.pathname.match(/^\/api\/v1\/agent\/payments\/([^/]+)$/);
  if (request.method === 'GET' && paymentMatch) return getPayment(env, auth.passportId, paymentMatch[1]);
  if (request.method === 'GET' && url.pathname === '/api/v1/agent/transactions') return listTransactions(env, auth.passportId, url);
  if (request.method === 'GET' && url.pathname === '/api/v1/agent/receipts') return listReceipts(env, auth.passportId, url);
  if (request.method === 'GET' && url.pathname === '/api/v1/agent/economic-trust') {
    requireFeature(env, 'FEATURE_ECONOMIC_TRUST');
    return getEconomicTrust(env, auth.passportId);
  }
  return null;
}

async function createWallet(request, env, auth) {
  const body = parseSignedJson(auth);
  if (body.passportId && body.passportId !== auth.passportId) throw new AgentWalletError('CROSS_AGENT_WALLET_ACCESS', 403, 'Authenticated agent may only create its own wallet.');
  const existing = await walletForPassport(env, auth.passportId);
  if (existing) return json({ wallet: publicWallet(existing), created: false }, 200);

  const provider = createWalletProvider(env);
  const walletId = `aw_${crypto.randomUUID().replace(/-/g, '')}`;
  const created = await provider.createWallet({ passportId: auth.passportId, walletId });
  const now = new Date().toISOString();
  const policyId = String(body.policyId || 'STANDARD_AUTONOMOUS_V1');
  const policy = await env.DB.prepare('SELECT * FROM wallet_policies WHERE id=?1 AND status=\'active\'').bind(policyId).first();
  if (!policy) throw new AgentWalletError('WALLET_POLICY_NOT_FOUND', 422, 'Requested wallet policy is not active.');
  const initial = provider.initialBalance('USDC');

  const receipt = await buildWalletReceipt({
    receiptType: 'WALLET_SECURITY', agentId: auth.passportId, wallet: created.walletAddress,
    action: 'WALLET_CREATED', asset: 'USDC', provider: created.provider, network: created.network,
    settlementMode: created.settlementMode, status: 'ACTIVE', timestamp: now
  });
  const auditHash = await sha256Hex(canonicalize({ action: 'WALLET_CREATED', passportId: auth.passportId, walletId, walletAddress: created.walletAddress, policyId, timestamp: now }));

  const results = await env.DB.batch([
    env.DB.prepare(`INSERT INTO agent_wallets (id,passport_id,provider,network,chain_id,wallet_address,settlement_mode,status,agent_signer_ref,policy_id,created_at,activated_at,updated_at) VALUES (?1,?2,?3,?4,?5,?6,?7,'ACTIVE',?8,?9,?10,?10,?10)`).bind(walletId, auth.passportId, created.provider, created.network, created.chainId, created.walletAddress, created.settlementMode, auth.passportId, policyId, now),
    env.DB.prepare(`INSERT INTO wallet_balances (wallet_id,asset,available_atomic,reserved_atomic,updated_at) VALUES (?1,'USDC',?2,0,?3)`).bind(walletId, toDbInteger(initial), now),
    env.DB.prepare(`INSERT INTO agent_economic_events (id,passport_id,wallet_id,event_type,amount_atomic,asset,related_id,metadata_json,created_at) VALUES (?1,?2,?3,'WALLET_CREATED',?4,'USDC',?5,?6,?7)`).bind(id('ee'), auth.passportId, walletId, toDbInteger(initial), walletId, JSON.stringify({ provider: created.provider, settlementMode: created.settlementMode, seededTestBalance: true }), now),
    env.DB.prepare(`INSERT INTO wallet_audit_log (id,passport_id,wallet_id,action,actor_type,actor_ref,reason,previous_state_json,new_state_json,related_id,payload_hash,created_at) VALUES (?1,?2,?3,'WALLET_CREATED','AGENT',?2,'AGENT_REQUEST',NULL,?4,?3,?5,?6)`).bind(id('wa'), auth.passportId, walletId, JSON.stringify({ status: 'ACTIVE', policyId }), auditHash, now),
    receiptInsert(env, receipt)
  ]);
  assertBatch(results);
  return json({ wallet: publicWallet(await walletForPassport(env, auth.passportId)), treasury: { USDC: formatAssetAmount(initial, 'USDC') }, receipt }, 201);
}

async function createPayment(request, env, auth) {
  const body = parseSignedJson(auth);
  const key = String(request.headers.get('idempotency-key') || '').trim();
  if (!/^[A-Za-z0-9._:-]{8,128}$/.test(key)) throw new AgentWalletError('IDEMPOTENCY_KEY_REQUIRED', 400, 'Idempotency-Key header of 8-128 safe characters is required.');
  const recipientPassportId = String(body.recipientAgentId || '').trim();
  if (!recipientPassportId || recipientPassportId === auth.passportId) throw new AgentWalletError('INVALID_RECIPIENT', 400, 'Recipient must be another Accord agent.');
  const asset = String(body.asset || 'USDC').toUpperCase();
  const amountAtomic = parseAssetAmount(String(body.amount ?? ''), asset);
  if (amountAtomic <= 0n) throw new AgentWalletError('INVALID_AMOUNT', 400, 'Payment amount must be greater than zero.');

  const requestDigest = await sha256Hex(canonicalize({ recipientPassportId, amountAtomic: amountAtomic.toString(), asset, purpose: body.purpose || 'AGENT_PAYMENT', taskId: body.taskId || null }));
  const prior = await env.DB.prepare(`SELECT * FROM agent_payment_intents WHERE sender_passport_id=?1 AND idempotency_key=?2`).bind(auth.passportId, key).first();
  if (prior) {
    if (prior.request_digest !== requestDigest) throw new AgentWalletError('IDEMPOTENCY_KEY_CONFLICT', 409, 'Idempotency key was already used for a different payment request.');
    return json({ payment: serializePayment(prior), idempotentReplay: true }, 200);
  }

  const sender = await requireActiveWallet(env, auth.passportId);
  const recipient = await requireActiveWallet(env, recipientPassportId, 'RECIPIENT_WALLET_NOT_ACTIVE');
  const policyRow = await env.DB.prepare('SELECT * FROM wallet_policies WHERE id=?1').bind(sender.policy_id).first();
  const policy = policyFromRow(policyRow);
  const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  const spentRow = await env.DB.prepare(`SELECT COALESCE(SUM(amount_atomic),0) AS spent FROM agent_payment_intents WHERE sender_passport_id=?1 AND status='CONFIRMED' AND created_at>=?2`).bind(auth.passportId, since).first();
  const decision = evaluateTransactionPolicy({ wallet: sender, policy, transaction: { amountAtomic, asset, taskId: body.taskId || null }, spentLast24hAtomic: atomicFromDb(spentRow?.spent || 0), recipientWallet: recipient });
  const now = new Date().toISOString();
  const intentId = id('pi');

  if (decision.decision === POLICY_DECISIONS.DENY || decision.decision === POLICY_DECISIONS.QUARANTINE) {
    const receipt = await buildWalletReceipt({ receiptType: 'FINANCIAL_TRANSACTION', agentId: auth.passportId, wallet: sender.wallet_address, action: 'PAYMENT', recipientAgentId: recipientPassportId, amountAtomic, asset, purpose: body.purpose || 'AGENT_PAYMENT', taskId: body.taskId || null, policyDecision: decision.decision, policyCode: decision.code, guardianApproval: false, provider: sender.provider, network: sender.network, settlementMode: sender.settlement_mode, status: 'BLOCKED', reason: decision.reason, timestamp: now });
    const results = await env.DB.batch([
      paymentInsert(env, { intentId, key, requestDigest, sender: auth.passportId, recipient: recipientPassportId, senderWallet: sender.id, recipientWallet: recipient.id, amountAtomic, asset, purpose: body.purpose || 'AGENT_PAYMENT', taskId: body.taskId || null, status: 'BLOCKED', decision, receiptId: receipt.receiptId, now }),
      receiptInsert(env, receipt),
      eventInsert(env, auth.passportId, sender.id, 'POLICY_BLOCK', amountAtomic, asset, intentId, { code: decision.code, reason: decision.reason }, now)
    ]);
    assertBatch(results);
    return json({ payment: { id: intentId, status: 'BLOCKED', policy: decision }, receipt }, 422);
  }

  if (decision.decision === POLICY_DECISIONS.REQUIRE_APPROVAL) {
    const receipt = await buildWalletReceipt({ receiptType: 'FINANCIAL_TRANSACTION', agentId: auth.passportId, wallet: sender.wallet_address, action: 'PAYMENT', recipientAgentId: recipientPassportId, amountAtomic, asset, purpose: body.purpose || 'AGENT_PAYMENT', taskId: body.taskId || null, policyDecision: decision.decision, policyCode: decision.code, guardianApproval: false, provider: sender.provider, network: sender.network, settlementMode: sender.settlement_mode, status: 'APPROVAL_REQUIRED', reason: decision.reason, timestamp: now });
    const results = await env.DB.batch([
      paymentInsert(env, { intentId, key, requestDigest, sender: auth.passportId, recipient: recipientPassportId, senderWallet: sender.id, recipientWallet: recipient.id, amountAtomic, asset, purpose: body.purpose || 'AGENT_PAYMENT', taskId: body.taskId || null, status: 'APPROVAL_REQUIRED', decision, receiptId: receipt.receiptId, now }),
      receiptInsert(env, receipt),
      eventInsert(env, auth.passportId, sender.id, 'GUARDIAN_APPROVAL', amountAtomic, asset, intentId, { pending: true }, now)
    ]);
    assertBatch(results);
    return json({ payment: { id: intentId, status: 'APPROVAL_REQUIRED', policy: decision }, receipt }, 202);
  }

  const balance = await env.DB.prepare(`SELECT available_atomic FROM wallet_balances WHERE wallet_id=?1 AND asset=?2`).bind(sender.id, asset).first();
  if (!balance || atomicFromDb(balance.available_atomic) < amountAtomic) throw new AgentWalletError('INSUFFICIENT_BALANCE', 422, 'Available wallet balance is insufficient.');

  const provider = createWalletProvider(env);
  if (provider.settlementMode !== 'simulated') throw new AgentWalletError('ONCHAIN_EXECUTION_NOT_ENABLED', 503, 'This MVP only executes the explicitly configured safe test provider.');
  const prepared = await provider.prepareTransaction({ paymentIntentId: intentId, senderWallet: sender, recipientWallet: recipient, amountAtomic, asset });
  const transactionId = id('ft');
  const receipt = await buildWalletReceipt({ receiptType: 'FINANCIAL_TRANSACTION', agentId: auth.passportId, wallet: sender.wallet_address, action: 'PAYMENT', recipientAgentId: recipientPassportId, amountAtomic, asset, purpose: body.purpose || 'AGENT_PAYMENT', taskId: body.taskId || null, policyDecision: decision.decision, policyCode: decision.code, guardianApproval: false, provider: prepared.provider, network: prepared.network, settlementMode: prepared.settlementMode, transactionRef: prepared.providerTxRef, status: 'CONFIRMED', timestamp: now });

  const results = await env.DB.batch([
    paymentInsert(env, { intentId, key, requestDigest, sender: auth.passportId, recipient: recipientPassportId, senderWallet: sender.id, recipientWallet: recipient.id, amountAtomic, asset, purpose: body.purpose || 'AGENT_PAYMENT', taskId: body.taskId || null, status: 'CONFIRMED', decision, receiptId: receipt.receiptId, now, confirmedAt: now }),
    env.DB.prepare(`UPDATE wallet_balances SET available_atomic=available_atomic-?1,updated_at=?2 WHERE wallet_id=?3 AND asset=?4 AND available_atomic>=?1`).bind(toDbInteger(amountAtomic), now, sender.id, asset),
    env.DB.prepare(`INSERT INTO wallet_balances (wallet_id,asset,available_atomic,reserved_atomic,updated_at) VALUES (?1,?2,?3,0,?4) ON CONFLICT(wallet_id,asset) DO UPDATE SET available_atomic=available_atomic+excluded.available_atomic,updated_at=excluded.updated_at`).bind(recipient.id, asset, toDbInteger(amountAtomic), now),
    env.DB.prepare(`INSERT INTO agent_financial_transactions (id,payment_intent_id,provider,network,provider_tx_ref,blockchain_tx_hash,settlement_mode,state,amount_atomic,asset,submitted_at,confirmed_at,created_at,updated_at) VALUES (?1,?2,?3,?4,?5,NULL,?6,'CONFIRMED',?7,?8,?9,?9,?9,?9)`).bind(transactionId, intentId, prepared.provider, prepared.network, prepared.providerTxRef, prepared.settlementMode, toDbInteger(amountAtomic), asset, now),
    receiptInsert(env, receipt),
    eventInsert(env, auth.passportId, sender.id, 'PAYMENT_SENT', amountAtomic, asset, intentId, { recipientPassportId }, now),
    eventInsert(env, recipientPassportId, recipient.id, 'PAYMENT_RECEIVED', amountAtomic, asset, intentId, { senderPassportId: auth.passportId }, now),
    eventInsert(env, auth.passportId, sender.id, 'SETTLEMENT_CONFIRMED', amountAtomic, asset, transactionId, { providerTxRef: prepared.providerTxRef }, now)
  ]);
  assertBatch(results);
  if ((results[1]?.meta?.changes ?? 1) !== 1) throw new AgentWalletError('BALANCE_RACE_DETECTED', 409, 'Balance changed during settlement; reconciliation required.');
  return json({ payment: { id: intentId, status: 'CONFIRMED', transactionId, providerTxRef: prepared.providerTxRef, amount: formatAssetAmount(amountAtomic, asset), asset, policy: decision }, receipt }, 201);
}

async function getWallet(env, passportId) {
  const wallet = await walletForPassport(env, passportId);
  return json({ wallet: wallet ? publicWallet(wallet) : null, enabled: flag(env, 'FEATURE_AGENT_WALLETS'), mode: String(env.WALLET_MODE || 'disabled') });
}
async function getBalance(env, passportId) {
  const wallet = await requireWallet(env, passportId);
  const rows = await env.DB.prepare('SELECT asset,available_atomic,reserved_atomic,updated_at FROM wallet_balances WHERE wallet_id=?1 ORDER BY asset').bind(wallet.id).all();
  return json({ wallet: publicWallet(wallet), balances: (rows.results || []).map(r => ({ asset: r.asset, available: formatAssetAmount(r.available_atomic, r.asset), reserved: formatAssetAmount(r.reserved_atomic, r.asset), authoritativeAtomic: { available: String(r.available_atomic), reserved: String(r.reserved_atomic) }, updatedAt: r.updated_at })) });
}
async function getPolicy(env, passportId) {
  const wallet = await requireWallet(env, passportId); const row = await env.DB.prepare('SELECT * FROM wallet_policies WHERE id=?1').bind(wallet.policy_id).first(); const p = policyFromRow(row);
  return json({ policy: { id: p.id, version: p.version, status: p.status, singleTransactionLimit: formatAssetAmount(p.singleTransactionLimitAtomic), dailySpendingLimit: formatAssetAmount(p.dailySpendingLimitAtomic), rolling24hLimit: formatAssetAmount(p.rolling24hLimitAtomic), guardianApprovalAbove: formatAssetAmount(p.guardianApprovalAboveAtomic), allowedAssets: p.allowedAssets, requireTaskLink: p.requireTaskLink, allowUnknownRecipients: p.allowUnknownRecipients, allowExternalTransfer: p.allowExternalTransfer } });
}
async function getPayment(env, passportId, paymentId) {
  const row = await env.DB.prepare(`SELECT * FROM agent_payment_intents WHERE id=?1 AND (sender_passport_id=?2 OR recipient_passport_id=?2)`).bind(paymentId, passportId).first();
  if (!row) throw new AgentWalletError('PAYMENT_NOT_FOUND', 404); return json({ payment: serializePayment(row) });
}
async function listTransactions(env, passportId, url) {
  const limit = pageLimit(url); const offset = pageOffset(url);
  const rows = await env.DB.prepare(`SELECT t.*,p.sender_passport_id,p.recipient_passport_id,p.purpose,p.task_id,p.receipt_id FROM agent_financial_transactions t JOIN agent_payment_intents p ON p.id=t.payment_intent_id WHERE p.sender_passport_id=?1 OR p.recipient_passport_id=?1 ORDER BY t.created_at DESC LIMIT ?2 OFFSET ?3`).bind(passportId, limit, offset).all();
  return json({ transactions: (rows.results || []).map(r => ({ id: r.id, paymentIntentId: r.payment_intent_id, direction: r.sender_passport_id === passportId ? 'OUTGOING' : 'INCOMING', counterpartyAgentId: r.sender_passport_id === passportId ? r.recipient_passport_id : r.sender_passport_id, amount: formatAssetAmount(r.amount_atomic, r.asset), asset: r.asset, purpose: r.purpose, taskId: r.task_id, state: r.state, provider: r.provider, network: r.network, transactionHash: r.blockchain_tx_hash, providerTxRef: r.provider_tx_ref, receiptId: r.receipt_id, createdAt: r.created_at })), page: { limit, offset } });
}
async function listReceipts(env, passportId, url) {
  const limit = pageLimit(url); const offset = pageOffset(url);
  const rows = await env.DB.prepare(`SELECT r.id,r.verified_at,r.receipt FROM receipts r JOIN agent_payment_intents p ON p.receipt_id=r.id WHERE p.sender_passport_id=?1 OR p.recipient_passport_id=?1 ORDER BY r.verified_at DESC LIMIT ?2 OFFSET ?3`).bind(passportId, limit, offset).all();
  return json({ receipts: (rows.results || []).map(r => safeJson(r.receipt, { receiptId: r.id, timestamp: r.verified_at })), page: { limit, offset } });
}
async function getEconomicTrust(env, passportId) {
  const wallet = await walletForPassport(env, passportId);
  const metrics = await env.DB.prepare(`SELECT COUNT(*) transactions, SUM(CASE WHEN status='CONFIRMED' THEN 1 ELSE 0 END) successful, SUM(CASE WHEN status='FAILED' THEN 1 ELSE 0 END) failed, SUM(CASE WHEN status='BLOCKED' THEN 1 ELSE 0 END) blocked FROM agent_payment_intents WHERE sender_passport_id=?1 OR recipient_passport_id=?1`).bind(passportId).first();
  const incidents = await env.DB.prepare(`SELECT COUNT(*) incidents FROM wallet_audit_log WHERE passport_id=?1 AND action IN ('WALLET_FROZEN','WALLET_QUARANTINED','SIGNER_ROTATED')`).bind(passportId).first();
  const tx = Number(metrics?.transactions || 0), ok = Number(metrics?.successful || 0), failed = Number(metrics?.failed || 0), blocked = Number(metrics?.blocked || 0), securityIncidents = Number(incidents?.incidents || 0);
  const level = !wallet || tx === 0 ? 'UNKNOWN' : securityIncidents > 0 || failed > 2 ? 'LOW' : tx >= 100 && ok / tx >= .98 ? 'VERY_HIGH' : tx >= 20 && ok / tx >= .95 ? 'HIGH' : tx >= 5 ? 'MEDIUM' : 'LOW';
  return json({ agentId: passportId, walletVerified: Boolean(wallet), walletStatus: wallet?.status || null, walletAgeDays: wallet ? Math.max(0, Math.floor((Date.now() - Date.parse(wallet.created_at)) / 86400000)) : 0, transactions: tx, successfulSettlements: ok, failedSettlements: failed, policyBlocks: blocked, walletSecurityIncidents: securityIncidents, economicTrustLevel: level, limitations: ['This is an AccordTrace operational trust band, not a credit score, legal identity determination, or guarantee of solvency.'] });
}

async function handleAdmin(request, env, url) {
  requireFeature(env, 'FEATURE_GUARDIAN_CONTROLS'); requireOperator(request, env);
  const match = url.pathname.match(/^\/api\/v1\/wallet-admin\/wallets\/([^/]+)\/(freeze|unfreeze)$/);
  if (request.method !== 'POST' || !match) return null;
  const wallet = await env.DB.prepare('SELECT * FROM agent_wallets WHERE id=?1').bind(match[1]).first();
  if (!wallet) throw new AgentWalletError('WALLET_NOT_FOUND', 404);
  const action = match[2]; const nextStatus = action === 'freeze' ? 'FROZEN' : 'ACTIVE';
  if (action === 'unfreeze' && !['FROZEN', 'QUARANTINED'].includes(wallet.status)) throw new AgentWalletError('INVALID_WALLET_STATE_TRANSITION', 409);
  if (action === 'freeze' && wallet.status === 'DISABLED') throw new AgentWalletError('INVALID_WALLET_STATE_TRANSITION', 409);
  const body = await request.json().catch(() => ({})); const reason = String(body.reason || 'OPERATOR_SECURITY_ACTION').slice(0, 300); const now = new Date().toISOString();
  const receipt = await buildWalletReceipt({ receiptType: 'WALLET_SECURITY', agentId: wallet.passport_id, wallet: wallet.wallet_address, action: action === 'freeze' ? 'WALLET_FROZEN' : 'WALLET_UNFROZEN', policyDecision: action === 'freeze' ? 'QUARANTINE' : 'ALLOW', provider: wallet.provider, network: wallet.network, settlementMode: wallet.settlement_mode, status: nextStatus, reason, timestamp: now });
  const auditHash = await sha256Hex(canonicalize({ walletId: wallet.id, action, previousStatus: wallet.status, nextStatus, reason, timestamp: now }));
  const results = await env.DB.batch([
    env.DB.prepare(`UPDATE agent_wallets SET status=?1,frozen_at=?2,updated_at=?3 WHERE id=?4`).bind(nextStatus, action === 'freeze' ? now : null, now, wallet.id),
    env.DB.prepare(`INSERT INTO wallet_audit_log (id,passport_id,wallet_id,action,actor_type,actor_ref,reason,previous_state_json,new_state_json,related_id,payload_hash,created_at) VALUES (?1,?2,?3,?4,'ACCORD_OPERATOR','wallet-guardian',?5,?6,?7,?3,?8,?9)`).bind(id('wa'), wallet.passport_id, wallet.id, action === 'freeze' ? 'WALLET_FROZEN' : 'WALLET_UNFROZEN', reason, JSON.stringify({ status: wallet.status }), JSON.stringify({ status: nextStatus }), auditHash, now),
    receiptInsert(env, receipt),
    eventInsert(env, wallet.passport_id, wallet.id, action === 'freeze' ? 'WALLET_FROZEN' : 'WALLET_UNFROZEN', null, null, wallet.id, { reason }, now)
  ]);
  assertBatch(results); return json({ wallet: publicWallet(await walletForPassport(env, wallet.passport_id)), receipt });
}

function paymentInsert(env, x) {
  return env.DB.prepare(`INSERT INTO agent_payment_intents (id,idempotency_key,request_digest,sender_passport_id,recipient_passport_id,sender_wallet_id,recipient_wallet_id,amount_atomic,asset,purpose,task_id,status,policy_decision,policy_code,policy_reason,requires_guardian_approval,receipt_id,requested_at,confirmed_at,created_at,updated_at) VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9,?10,?11,?12,?13,?14,?15,?16,?17,?18,?19,?18,?18)`).bind(x.intentId, x.key, x.requestDigest, x.sender, x.recipient, x.senderWallet, x.recipientWallet, toDbInteger(x.amountAtomic), x.asset, x.purpose, x.taskId, x.status, x.decision.decision, x.decision.code, x.decision.reason, x.decision.requiresGuardianApproval ? 1 : 0, x.receiptId, x.now, x.confirmedAt || null);
}
function eventInsert(env, passportId, walletId, type, amountAtomic, asset, relatedId, metadata, now) {
  return env.DB.prepare(`INSERT INTO agent_economic_events (id,passport_id,wallet_id,event_type,amount_atomic,asset,related_id,metadata_json,created_at) VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9)`).bind(id('ee'), passportId, walletId, type, amountAtomic == null ? null : toDbInteger(amountAtomic), asset, relatedId, JSON.stringify(metadata || {}), now);
}
async function walletForPassport(env, passportId) { return env.DB.prepare('SELECT * FROM agent_wallets WHERE passport_id=?1').bind(passportId).first(); }
async function requireWallet(env, passportId) { const w = await walletForPassport(env, passportId); if (!w) throw new AgentWalletError('WALLET_NOT_FOUND', 404); return w; }
async function requireActiveWallet(env, passportId, code = 'WALLET_NOT_ACTIVE') { const w = await requireWallet(env, passportId); if (w.status !== 'ACTIVE') throw new AgentWalletError(code, 422, `Wallet status ${w.status} does not allow settlement.`); return w; }
function publicWallet(w) { return { id: w.id, agentId: w.passport_id, provider: w.provider, network: w.network, chainId: w.chain_id, walletAddress: w.wallet_address, settlementMode: w.settlement_mode, status: w.status, agentSigner: { type: w.agent_signer_type, ref: w.agent_signer_ref }, guardian: { mode: w.guardian_mode }, policyId: w.policy_id, createdAt: w.created_at, activatedAt: w.activated_at, frozenAt: w.frozen_at, updatedAt: w.updated_at }; }
function serializePayment(r) { return { id: r.id, senderAgentId: r.sender_passport_id, recipientAgentId: r.recipient_passport_id, amount: formatAssetAmount(r.amount_atomic, r.asset), asset: r.asset, purpose: r.purpose, taskId: r.task_id, status: r.status, policyDecision: r.policy_decision, policyCode: r.policy_code, requiresGuardianApproval: Boolean(r.requires_guardian_approval), receiptId: r.receipt_id, createdAt: r.created_at, confirmedAt: r.confirmed_at }; }
function requireFeature(env, name) { if (!flag(env, name)) throw new AgentWalletError('FEATURE_DISABLED', 404, `${name} is disabled.`); }
function flag(env, name) { return /^(1|true|yes|on)$/i.test(String(env[name] || 'false')); }
function requireOperator(request, env) { const expected = String(env.WALLET_OPERATOR_TOKEN || ''); const auth = String(request.headers.get('authorization') || ''); if (!expected || auth !== `Bearer ${expected}`) throw new AgentWalletError('OPERATOR_AUTH_REQUIRED', 401); }
async function applyRateLimit(env, passportId, category, max) { const windowKey = Math.floor(Date.now() / 60000); const now = new Date().toISOString(); await env.DB.prepare(`INSERT INTO agent_wallet_rate_windows (passport_id,category,window_key,request_count,updated_at) VALUES (?1,?2,?3,1,?4) ON CONFLICT(passport_id,category,window_key) DO UPDATE SET request_count=request_count+1,updated_at=excluded.updated_at`).bind(passportId, category, windowKey, now).run(); const row = await env.DB.prepare(`SELECT request_count FROM agent_wallet_rate_windows WHERE passport_id=?1 AND category=?2 AND window_key=?3`).bind(passportId, category, windowKey).first(); if (Number(row?.request_count || 0) > max) throw new AgentWalletError('RATE_LIMITED', 429, 'Agent wallet request rate exceeded.'); }
function pageLimit(url) { const n = Number(url.searchParams.get('limit') || 25); return Number.isInteger(n) && n > 0 ? Math.min(n, PAGE_MAX) : 25; }
function pageOffset(url) { const n = Number(url.searchParams.get('offset') || 0); return Number.isInteger(n) && n >= 0 ? n : 0; }
function safeJson(value, fallback) { try { return JSON.parse(value); } catch { return fallback; } }
function id(prefix) { return `${prefix}_${crypto.randomUUID().replace(/-/g, '')}`; }
function assertBatch(results) { if (!Array.isArray(results) || results.some(x => x && x.success === false)) throw new AgentWalletError('DATABASE_TRANSACTION_FAILED', 500, 'Wallet state change did not commit cleanly.'); }
function json(value, status = 200) { return new Response(JSON.stringify(value), { status, headers: JSON_HEADERS }); }

export function agentWalletErrorResponse(error) {
  const known = error instanceof AgentWalletError || error instanceof AgentRequestError;
  const status = known ? error.status : 500;
  const body = { error: { code: known ? error.code : 'INTERNAL_ERROR', message: error instanceof Error ? error.message : 'Unknown error', retryable: status >= 500 || status === 429 } };
  if (known && error.details) body.error.details = error.details;
  return json(body, status);
}
