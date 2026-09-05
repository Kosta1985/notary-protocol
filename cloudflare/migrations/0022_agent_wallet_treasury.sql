CREATE TABLE IF NOT EXISTS wallet_policies (
  id TEXT PRIMARY KEY,
  version INTEGER NOT NULL,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','retired')),
  single_transaction_limit_atomic INTEGER NOT NULL CHECK (single_transaction_limit_atomic >= 0),
  daily_spending_limit_atomic INTEGER NOT NULL CHECK (daily_spending_limit_atomic >= 0),
  rolling_24h_limit_atomic INTEGER NOT NULL CHECK (rolling_24h_limit_atomic >= 0),
  guardian_approval_above_atomic INTEGER NOT NULL CHECK (guardian_approval_above_atomic >= 0),
  allowed_assets_json TEXT NOT NULL,
  allow_unknown_recipients INTEGER NOT NULL DEFAULT 0 CHECK (allow_unknown_recipients IN (0,1)),
  allow_external_transfer INTEGER NOT NULL DEFAULT 0 CHECK (allow_external_transfer IN (0,1)),
  require_task_link INTEGER NOT NULL DEFAULT 0 CHECK (require_task_link IN (0,1)),
  block_high_risk_destinations INTEGER NOT NULL DEFAULT 1 CHECK (block_high_risk_destinations IN (0,1)),
  created_at TEXT NOT NULL
);

INSERT OR IGNORE INTO wallet_policies (
  id,version,status,single_transaction_limit_atomic,daily_spending_limit_atomic,rolling_24h_limit_atomic,
  guardian_approval_above_atomic,allowed_assets_json,allow_unknown_recipients,allow_external_transfer,
  require_task_link,block_high_risk_destinations,created_at
) VALUES (
  'STANDARD_AUTONOMOUS_V1',1,'active',100000000,100000000,100000000,50000000,
  '["USDC"]',0,0,0,1,'2026-09-05T00:00:00.000Z'
);

CREATE TABLE IF NOT EXISTS agent_wallets (
  id TEXT PRIMARY KEY,
  passport_id TEXT NOT NULL UNIQUE,
  provider TEXT NOT NULL,
  network TEXT NOT NULL,
  chain_id TEXT NOT NULL,
  wallet_address TEXT NOT NULL UNIQUE,
  settlement_mode TEXT NOT NULL CHECK (settlement_mode IN ('simulated','onchain')),
  status TEXT NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING','ACTIVE','FROZEN','QUARANTINED','RECOVERY','DISABLED')),
  agent_signer_type TEXT NOT NULL DEFAULT 'passport_ed25519',
  agent_signer_ref TEXT NOT NULL,
  guardian_mode TEXT NOT NULL DEFAULT 'accord_operator_rbac',
  policy_id TEXT NOT NULL,
  created_at TEXT NOT NULL,
  activated_at TEXT,
  frozen_at TEXT,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (passport_id) REFERENCES agent_passports(id),
  FOREIGN KEY (policy_id) REFERENCES wallet_policies(id)
);
CREATE INDEX IF NOT EXISTS idx_agent_wallets_status ON agent_wallets(status,updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_agent_wallets_address ON agent_wallets(wallet_address);

CREATE TABLE IF NOT EXISTS wallet_balances (
  wallet_id TEXT NOT NULL,
  asset TEXT NOT NULL,
  available_atomic INTEGER NOT NULL DEFAULT 0 CHECK (available_atomic >= 0),
  reserved_atomic INTEGER NOT NULL DEFAULT 0 CHECK (reserved_atomic >= 0),
  updated_at TEXT NOT NULL,
  PRIMARY KEY (wallet_id,asset),
  FOREIGN KEY (wallet_id) REFERENCES agent_wallets(id)
);

CREATE TABLE IF NOT EXISTS agent_wallet_request_nonces (
  passport_id TEXT NOT NULL,
  nonce TEXT NOT NULL,
  request_digest TEXT NOT NULL,
  first_seen_at TEXT NOT NULL,
  PRIMARY KEY (passport_id,nonce),
  FOREIGN KEY (passport_id) REFERENCES agent_passports(id)
);
CREATE INDEX IF NOT EXISTS idx_wallet_nonce_seen ON agent_wallet_request_nonces(first_seen_at DESC);

CREATE TABLE IF NOT EXISTS agent_payment_intents (
  id TEXT PRIMARY KEY,
  idempotency_key TEXT NOT NULL,
  request_digest TEXT NOT NULL,
  sender_passport_id TEXT NOT NULL,
  recipient_passport_id TEXT NOT NULL,
  sender_wallet_id TEXT NOT NULL,
  recipient_wallet_id TEXT NOT NULL,
  amount_atomic INTEGER NOT NULL CHECK (amount_atomic > 0),
  asset TEXT NOT NULL,
  purpose TEXT NOT NULL,
  task_id TEXT,
  status TEXT NOT NULL CHECK (status IN ('CREATED','POLICY_CHECK','APPROVAL_REQUIRED','APPROVED','SUBMITTED','CONFIRMED','FAILED','CANCELLED','BLOCKED')),
  policy_decision TEXT NOT NULL CHECK (policy_decision IN ('ALLOW','DENY','REQUIRE_APPROVAL','QUARANTINE')),
  policy_code TEXT NOT NULL,
  policy_reason TEXT NOT NULL,
  requires_guardian_approval INTEGER NOT NULL DEFAULT 0 CHECK (requires_guardian_approval IN (0,1)),
  receipt_id TEXT,
  requested_at TEXT NOT NULL,
  approved_at TEXT,
  submitted_at TEXT,
  confirmed_at TEXT,
  failed_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE(sender_passport_id,idempotency_key),
  FOREIGN KEY (sender_passport_id) REFERENCES agent_passports(id),
  FOREIGN KEY (recipient_passport_id) REFERENCES agent_passports(id),
  FOREIGN KEY (sender_wallet_id) REFERENCES agent_wallets(id),
  FOREIGN KEY (recipient_wallet_id) REFERENCES agent_wallets(id)
);
CREATE INDEX IF NOT EXISTS idx_payment_intents_sender_created ON agent_payment_intents(sender_passport_id,created_at DESC);
CREATE INDEX IF NOT EXISTS idx_payment_intents_recipient_created ON agent_payment_intents(recipient_passport_id,created_at DESC);
CREATE INDEX IF NOT EXISTS idx_payment_intents_status ON agent_payment_intents(status,created_at DESC);

CREATE TABLE IF NOT EXISTS agent_financial_transactions (
  id TEXT PRIMARY KEY,
  payment_intent_id TEXT NOT NULL UNIQUE,
  provider TEXT NOT NULL,
  network TEXT NOT NULL,
  provider_tx_ref TEXT NOT NULL UNIQUE,
  blockchain_tx_hash TEXT,
  settlement_mode TEXT NOT NULL CHECK (settlement_mode IN ('simulated','onchain')),
  state TEXT NOT NULL CHECK (state IN ('PREPARED','SIGNED','SUBMITTED','CONFIRMED','FAILED','REVERTED')),
  amount_atomic INTEGER NOT NULL CHECK (amount_atomic > 0),
  asset TEXT NOT NULL,
  submitted_at TEXT,
  confirmed_at TEXT,
  failed_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (payment_intent_id) REFERENCES agent_payment_intents(id)
);
CREATE INDEX IF NOT EXISTS idx_financial_transactions_state ON agent_financial_transactions(state,created_at DESC);
CREATE INDEX IF NOT EXISTS idx_financial_transactions_hash ON agent_financial_transactions(blockchain_tx_hash);

CREATE TABLE IF NOT EXISTS agent_economic_events (
  id TEXT PRIMARY KEY,
  passport_id TEXT NOT NULL,
  wallet_id TEXT,
  event_type TEXT NOT NULL,
  amount_atomic INTEGER,
  asset TEXT,
  related_id TEXT,
  metadata_json TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL,
  FOREIGN KEY (passport_id) REFERENCES agent_passports(id),
  FOREIGN KEY (wallet_id) REFERENCES agent_wallets(id)
);
CREATE INDEX IF NOT EXISTS idx_economic_events_passport_created ON agent_economic_events(passport_id,created_at DESC);
CREATE INDEX IF NOT EXISTS idx_economic_events_type_created ON agent_economic_events(event_type,created_at DESC);

CREATE TABLE IF NOT EXISTS wallet_audit_log (
  id TEXT PRIMARY KEY,
  passport_id TEXT NOT NULL,
  wallet_id TEXT NOT NULL,
  action TEXT NOT NULL,
  actor_type TEXT NOT NULL,
  actor_ref TEXT NOT NULL,
  reason TEXT,
  previous_state_json TEXT,
  new_state_json TEXT,
  related_id TEXT,
  payload_hash TEXT NOT NULL,
  created_at TEXT NOT NULL,
  FOREIGN KEY (passport_id) REFERENCES agent_passports(id),
  FOREIGN KEY (wallet_id) REFERENCES agent_wallets(id)
);
CREATE INDEX IF NOT EXISTS idx_wallet_audit_wallet_created ON wallet_audit_log(wallet_id,created_at DESC);
CREATE INDEX IF NOT EXISTS idx_wallet_audit_passport_created ON wallet_audit_log(passport_id,created_at DESC);
