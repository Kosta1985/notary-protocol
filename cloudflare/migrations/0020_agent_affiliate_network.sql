PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS affiliate_profiles (
  passport_id TEXT PRIMARY KEY REFERENCES agent_passports(id) ON DELETE CASCADE,
  referral_code TEXT NOT NULL UNIQUE,
  status TEXT NOT NULL DEFAULT 'active' CHECK(status IN ('active','paused','review','closed')),
  terms_version TEXT NOT NULL,
  enrollment_request_id TEXT NOT NULL UNIQUE,
  accepted_at TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS affiliate_request_nonces (
  request_id TEXT PRIMARY KEY,
  passport_id TEXT NOT NULL REFERENCES agent_passports(id) ON DELETE CASCADE,
  purpose TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS affiliate_attributions (
  id TEXT PRIMARY KEY,
  referrer_passport_id TEXT NOT NULL REFERENCES agent_passports(id) ON DELETE RESTRICT,
  referred_passport_id TEXT NOT NULL UNIQUE REFERENCES agent_passports(id) ON DELETE RESTRICT,
  referral_code TEXT NOT NULL REFERENCES affiliate_profiles(referral_code) ON DELETE RESTRICT,
  state TEXT NOT NULL DEFAULT 'reserved' CHECK(state IN ('reserved','held','qualified','rejected','reversed')),
  risk_flags_json TEXT NOT NULL DEFAULT '[]',
  external_order_ref_digest TEXT UNIQUE,
  payment_identity_digest TEXT,
  gross_amount_atomic INTEGER,
  currency TEXT,
  attributed_at TEXT NOT NULL,
  qualified_at TEXT,
  reversed_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  CHECK(referrer_passport_id <> referred_passport_id),
  CHECK(gross_amount_atomic IS NULL OR gross_amount_atomic >= 0),
  CHECK(currency IS NULL OR length(currency) = 3)
);

CREATE INDEX IF NOT EXISTS idx_affiliate_attributions_referrer ON affiliate_attributions(referrer_passport_id, state, created_at);
CREATE INDEX IF NOT EXISTS idx_affiliate_attributions_payment_identity ON affiliate_attributions(payment_identity_digest, state);

CREATE TABLE IF NOT EXISTS affiliate_commissions (
  id TEXT PRIMARY KEY,
  attribution_id TEXT NOT NULL UNIQUE REFERENCES affiliate_attributions(id) ON DELETE RESTRICT,
  referrer_passport_id TEXT NOT NULL REFERENCES agent_passports(id) ON DELETE RESTRICT,
  referred_passport_id TEXT NOT NULL REFERENCES agent_passports(id) ON DELETE RESTRICT,
  amount_atomic INTEGER NOT NULL CHECK(amount_atomic > 0),
  currency TEXT NOT NULL CHECK(length(currency) = 3),
  state TEXT NOT NULL CHECK(state IN ('pending','earned','held','reversed','paid')),
  available_at TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  earned_at TEXT,
  held_at TEXT,
  reversed_at TEXT,
  paid_at TEXT,
  payout_ref_digest TEXT
);

CREATE INDEX IF NOT EXISTS idx_affiliate_commissions_referrer ON affiliate_commissions(referrer_passport_id, state, available_at);
CREATE INDEX IF NOT EXISTS idx_affiliate_commissions_maturity ON affiliate_commissions(state, available_at);

CREATE TABLE IF NOT EXISTS affiliate_ledger_events (
  id TEXT PRIMARY KEY,
  commission_id TEXT NOT NULL REFERENCES affiliate_commissions(id) ON DELETE RESTRICT,
  referrer_passport_id TEXT NOT NULL REFERENCES agent_passports(id) ON DELETE RESTRICT,
  event_type TEXT NOT NULL CHECK(event_type IN ('created','earned','held','released','reversed','paid')),
  amount_delta_atomic INTEGER NOT NULL,
  currency TEXT NOT NULL CHECK(length(currency) = 3),
  reason_code TEXT NOT NULL,
  event_digest TEXT NOT NULL UNIQUE,
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_affiliate_ledger_referrer ON affiliate_ledger_events(referrer_passport_id, created_at);
CREATE INDEX IF NOT EXISTS idx_affiliate_ledger_commission ON affiliate_ledger_events(commission_id, created_at);
