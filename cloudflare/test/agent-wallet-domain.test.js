import test from 'node:test';
import assert from 'node:assert/strict';
import { parseAssetAmount, formatAssetAmount, toDbInteger } from '../src/wallet/money.js';
import { evaluateTransactionPolicy, POLICY_DECISIONS } from '../src/wallet/policy.js';
import { AccordTestWalletProvider } from '../src/wallet/providers/accord-test.js';

const policy = {
  id: 'STANDARD_AUTONOMOUS_V1', version: 1, status: 'active',
  singleTransactionLimitAtomic: 100000000n,
  dailySpendingLimitAtomic: 100000000n,
  rolling24hLimitAtomic: 100000000n,
  guardianApprovalAboveAtomic: 50000000n,
  allowedAssets: ['USDC'], allowUnknownRecipients: false,
  allowExternalTransfer: false, requireTaskLink: false, blockHighRiskDestinations: true
};
const sender = { id: 'w-a', status: 'ACTIVE' };
const recipient = { id: 'w-b', status: 'ACTIVE' };

test('USDC arithmetic stays integer/BigInt based', () => {
  assert.equal(parseAssetAmount('1.75', 'USDC'), 1750000n);
  assert.equal(formatAssetAmount(1750000n, 'USDC'), '1.75');
  assert.equal(toDbInteger(1750000n), 1750000);
  assert.throws(() => parseAssetAmount(1.75, 'USDC'), /decimal strings/);
  assert.throws(() => parseAssetAmount('0.0000001', 'USDC'), /at most 6/);
});

test('funded-balance model rejects negative and credit-like money values', () => {
  assert.throws(() => parseAssetAmount('-1', 'USDC'), /non-negative decimal string/);
  assert.throws(() => parseAssetAmount('-0.000001', 'USDC'), /non-negative decimal string/);
  assert.throws(() => toDbInteger(-1n), /Negative monetary values/);
});

test('policy permits bounded autonomous payment', () => {
  const result = evaluateTransactionPolicy({ wallet: sender, policy, transaction: { amountAtomic: 1000000n, asset: 'USDC' }, recipientWallet: recipient });
  assert.equal(result.decision, POLICY_DECISIONS.ALLOW);
});

test('policy requires guardian approval above threshold', () => {
  const result = evaluateTransactionPolicy({ wallet: sender, policy, transaction: { amountAtomic: 60000000n, asset: 'USDC' }, recipientWallet: recipient });
  assert.equal(result.decision, POLICY_DECISIONS.REQUIRE_APPROVAL);
});

test('policy blocks hard limit and frozen wallet', () => {
  assert.equal(evaluateTransactionPolicy({ wallet: sender, policy, transaction: { amountAtomic: 101000000n, asset: 'USDC' }, recipientWallet: recipient }).code, 'TRANSACTION_LIMIT_EXCEEDED');
  assert.equal(evaluateTransactionPolicy({ wallet: { ...sender, status: 'FROZEN' }, policy, transaction: { amountAtomic: 1000000n, asset: 'USDC' }, recipientWallet: recipient }).code, 'WALLET_NOT_ACTIVE');
});

test('policy blocks rolling spending limit bypass', () => {
  const result = evaluateTransactionPolicy({ wallet: sender, policy, transaction: { amountAtomic: 20000000n, asset: 'USDC' }, spentLast24hAtomic: 90000000n, recipientWallet: recipient });
  assert.equal(result.code, 'DAILY_LIMIT_EXCEEDED');
});

test('test provider cannot run in production mode', () => {
  assert.throws(() => new AccordTestWalletProvider({ WALLET_MODE: 'production' }), /requires_testnet_mode/);
});

test('test provider creates separate deterministic-looking account identities', async () => {
  const provider = new AccordTestWalletProvider({ WALLET_MODE: 'testnet', TEST_WALLET_INITIAL_USDC_ATOMIC: '10000000' });
  const alpha = await provider.createWallet({ passportId: 'ACCORD-AGENT-ALPHA', walletId: 'w-alpha' });
  const beta = await provider.createWallet({ passportId: 'ACCORD-AGENT-BETA', walletId: 'w-beta' });
  assert.notEqual(alpha.walletAddress, beta.walletAddress);
  assert.match(alpha.walletAddress, /^acct_test_[0-9a-f]{40}$/);
  assert.equal(provider.initialBalance('USDC'), 10000000n);
});
