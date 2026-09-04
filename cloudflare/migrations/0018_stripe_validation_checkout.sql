CREATE TABLE IF NOT EXISTS stripe_validation_orders (
  id TEXT PRIMARY KEY,
  product_id TEXT NOT NULL,
  subject_passport_id TEXT NOT NULL,
  validator_passport_id TEXT NOT NULL,
  validation_type TEXT NOT NULL,
  subject_ref TEXT,
  subject_ref_digest TEXT,
  stripe_session_id TEXT UNIQUE,
  stripe_payment_intent_id TEXT,
  payment_status TEXT NOT NULL DEFAULT 'created' CHECK(payment_status IN ('created','pending','paid','failed','consumed','refunded')),
  amount_total INTEGER,
  currency TEXT,
  created_at TEXT NOT NULL,
  paid_at TEXT,
  consumed_at TEXT,
  updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_stripe_validation_subject ON stripe_validation_orders(subject_passport_id,payment_status,created_at);
CREATE INDEX IF NOT EXISTS idx_stripe_validation_session ON stripe_validation_orders(stripe_session_id);

CREATE TABLE IF NOT EXISTS stripe_webhook_events (
  id TEXT PRIMARY KEY,
  event_type TEXT NOT NULL,
  created_at TEXT NOT NULL
);
