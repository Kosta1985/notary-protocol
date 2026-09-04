CREATE TABLE IF NOT EXISTS validation_products (
  id TEXT PRIMARY KEY,
  validator_passport_id TEXT NOT NULL,
  validation_type TEXT NOT NULL,
  title TEXT NOT NULL,
  description TEXT,
  payment_offer_id TEXT NOT NULL,
  validity_days INTEGER NOT NULL,
  status TEXT NOT NULL DEFAULT 'active',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE(validator_passport_id, validation_type, payment_offer_id)
);

CREATE TABLE IF NOT EXISTS validation_requests (
  id TEXT PRIMARY KEY,
  product_id TEXT NOT NULL,
  subject_passport_id TEXT NOT NULL,
  validator_passport_id TEXT NOT NULL,
  validation_type TEXT NOT NULL,
  payment_order_id TEXT NOT NULL UNIQUE,
  subject_ref TEXT,
  subject_ref_digest TEXT,
  status TEXT NOT NULL DEFAULT 'pending',
  outcome TEXT,
  evidence_digest TEXT,
  challenge_digest TEXT,
  challenge_expires_at TEXT,
  attestation_id TEXT,
  requested_at TEXT NOT NULL,
  completed_at TEXT,
  expires_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_validation_requests_subject ON validation_requests(subject_passport_id, status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_validation_requests_validator ON validation_requests(validator_passport_id, status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_validation_products_type ON validation_products(validation_type, status, created_at DESC);
