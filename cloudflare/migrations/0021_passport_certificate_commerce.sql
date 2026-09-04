PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS passport_product_request_nonces (
  request_id TEXT PRIMARY KEY,
  passport_id TEXT NOT NULL REFERENCES agent_passports(id) ON DELETE CASCADE,
  purpose TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS passport_product_orders (
  id TEXT PRIMARY KEY,
  passport_id TEXT NOT NULL REFERENCES agent_passports(id) ON DELETE RESTRICT,
  product_id TEXT NOT NULL,
  product_version TEXT NOT NULL,
  referral_attribution_id TEXT REFERENCES affiliate_attributions(id) ON DELETE RESTRICT,
  referral_code TEXT,
  stripe_session_id TEXT UNIQUE,
  stripe_payment_intent_id TEXT,
  stripe_customer_id TEXT,
  payment_status TEXT NOT NULL DEFAULT 'created' CHECK(payment_status IN ('created','pending','paid','fulfilled','failed','review','refunded','chargeback')),
  amount_total INTEGER,
  currency TEXT,
  review_reason TEXT,
  created_at TEXT NOT NULL,
  paid_at TEXT,
  fulfilled_at TEXT,
  refunded_at TEXT,
  updated_at TEXT NOT NULL,
  CHECK(amount_total IS NULL OR amount_total >= 0),
  CHECK(currency IS NULL OR length(currency) = 3)
);

CREATE INDEX IF NOT EXISTS idx_passport_product_orders_passport ON passport_product_orders(passport_id,payment_status,created_at);
CREATE INDEX IF NOT EXISTS idx_passport_product_orders_session ON passport_product_orders(stripe_session_id);
CREATE INDEX IF NOT EXISTS idx_passport_product_orders_payment_intent ON passport_product_orders(stripe_payment_intent_id);
CREATE INDEX IF NOT EXISTS idx_passport_product_orders_attribution ON passport_product_orders(referral_attribution_id,payment_status);

CREATE TABLE IF NOT EXISTS agent_passport_certificates (
  id TEXT PRIMARY KEY,
  order_id TEXT NOT NULL UNIQUE REFERENCES passport_product_orders(id) ON DELETE RESTRICT,
  passport_id TEXT NOT NULL REFERENCES agent_passports(id) ON DELETE RESTRICT,
  product_id TEXT NOT NULL,
  product_version TEXT NOT NULL,
  public_key_fingerprint TEXT NOT NULL,
  state TEXT NOT NULL DEFAULT 'active' CHECK(state IN ('active','refunded','revoked')),
  certificate_json TEXT NOT NULL,
  issued_at TEXT NOT NULL,
  refunded_at TEXT,
  revoked_at TEXT,
  updated_at TEXT NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_agent_passport_certificate_initial ON agent_passport_certificates(passport_id,product_id,product_version);
CREATE INDEX IF NOT EXISTS idx_agent_passport_certificate_state ON agent_passport_certificates(passport_id,state,issued_at);

CREATE TABLE IF NOT EXISTS passport_product_stripe_events (
  id TEXT PRIMARY KEY,
  event_type TEXT NOT NULL,
  created_at TEXT NOT NULL,
  processed_at TEXT,
  processing_error TEXT
);
