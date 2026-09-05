import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {walletCapabilities} from '../src/wallet-capabilities.js';

const capabilities=walletCapabilities({
  WALLET_MODE:'testnet',WALLET_PROVIDER:'accord_test',WALLET_NETWORK:'accord:testnet',
  FEATURE_AGENT_WALLETS:'true',FEATURE_AGENT_PAYMENTS:'true',FEATURE_AGENT_TREASURY:'true',
  FEATURE_ECONOMIC_TRUST:'true',FEATURE_GUARDIAN_CONTROLS:'true'
});

test('machine contract declares agent-signed autonomy with deliberately limited Guardian control',()=>{
  const c=capabilities.control_model;
  assert.equal(c.name,'agent_signed_actions_with_limited_guardian_control');
  assert.equal(c.agent_signs_ordinary_actions,true);
  assert.equal(c.agent_can_initiate_payments,true);
  assert.equal(c.agent_can_self_approve_guardian_payments,false);
  assert.equal(c.accordtrace_holds_agent_passport_private_key,false);
  assert.deepEqual(c.guardian_can,[
    'freeze_wallet','unfreeze_wallet','approve_guardian_required_payment','deny_guardian_required_payment'
  ]);
  assert.equal(c.unrestricted_operator_withdrawal,false);
  assert.equal(c.hidden_seizure_path,false);
  assert.equal(c.funded_balance_only,true);
  for(const forbidden of [
    'initiate_agent_payment','withdraw_to_guardian','seize_or_redirect_balance','mint_or_create_balance',
    'bypass_insufficient_balance','create_credit_or_debt','sign_as_agent','export_agent_private_key'
  ]) assert.ok(c.guardian_cannot.includes(forbidden),forbidden);
});

test('Guardian approval remains funded-only and cannot become a credit fallback',()=>{
  assert.equal(capabilities.payment_contract.funded_balance_only,true);
  assert.equal(capabilities.payment_contract.negative_balances,false);
  assert.equal(capabilities.payment_contract.guardian_approval_creates_funds,false);
  assert.equal(capabilities.approval_lifecycle.approval_rechecks_funded_balance,true);
  assert.equal(capabilities.approval_lifecycle.credit_fallback,false);
  assert.equal(capabilities.credit_and_lending.enabled,false);
});

test('actual admin route surface has no operator withdrawal, sweep, seizure or sign-as-agent endpoint',()=>{
  const wallet=fs.readFileSync(new URL('../src/agent-wallet.js',import.meta.url),'utf8');
  const guardian=fs.readFileSync(new URL('../src/wallet-guardian.js',import.meta.url),'utf8');
  assert.match(wallet,/wallet-admin\\\/wallets\\\/\(\[\^\/\]\+\)\\\/\(freeze\|unfreeze\)/);
  assert.match(guardian,/wallet-admin\\\/payments\\\/\(pi_/);
  assert.doesNotMatch(wallet,/wallet-admin[^'"`\n]*(withdraw|sweep|seize|redirect|transfer|sign)/i);
  assert.doesNotMatch(guardian,/wallet-admin[^'"`\n]*(withdraw|sweep|seize|redirect|transfer|sign)/i);
});

test('schema cannot represent negative wallet balances and still contains no loan/debt/credit table',()=>{
  const schema=fs.readFileSync(new URL('../migrations/0022_agent_wallet_treasury.sql',import.meta.url),'utf8');
  assert.match(schema,/available_atomic INTEGER NOT NULL DEFAULT 0 CHECK \(available_atomic >= 0\)/);
  assert.match(schema,/reserved_atomic INTEGER NOT NULL DEFAULT 0 CHECK \(reserved_atomic >= 0\)/);
  assert.match(schema,/guardian_mode TEXT NOT NULL DEFAULT 'accord_operator_rbac'/);
  assert.doesNotMatch(schema,/CREATE TABLE[^;]*(loan|debt|credit)/i);
});

test('production config does not enable wallet or Guardian feature flags',()=>{
  const config=fs.readFileSync(new URL('../../wrangler.jsonc',import.meta.url),'utf8');
  for(const name of ['FEATURE_AGENT_WALLETS','FEATURE_AGENT_PAYMENTS','FEATURE_AGENT_TREASURY','FEATURE_GUARDIAN_CONTROLS']){
    assert.doesNotMatch(config,new RegExp(`"${name}"\\s*:\\s*"(?:1|true|yes|on)"`,'i'));
  }
});
