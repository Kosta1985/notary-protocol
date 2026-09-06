PRAGMA foreign_keys = ON;

-- Preserve Stripe payment truth while allowing a separately-auditable promotional
-- issuance path. Existing and future paid orders default to the Stripe source.
ALTER TABLE passport_product_orders ADD COLUMN fulfillment_source TEXT NOT NULL DEFAULT 'stripe';
ALTER TABLE passport_product_orders ADD COLUMN campaign TEXT;
ALTER TABLE agent_passport_certificates ADD COLUMN issuance_tier TEXT NOT NULL DEFAULT 'standard';
ALTER TABLE agent_passport_certificates ADD COLUMN founding_ordinal INTEGER;

-- The campaign is represented by exactly 1,000 durable slots. A slot is reserved
-- atomically for one active cryptographic Passport and can then be resumed safely
-- after a transient failure without consuming a second slot.
CREATE TABLE IF NOT EXISTS passport_founding_slots (
  campaign TEXT NOT NULL,
  slot INTEGER NOT NULL CHECK(slot BETWEEN 1 AND 1000),
  passport_id TEXT REFERENCES agent_passports(id) ON DELETE RESTRICT,
  request_id TEXT UNIQUE,
  order_id TEXT UNIQUE REFERENCES passport_product_orders(id) ON DELETE RESTRICT,
  certificate_id TEXT UNIQUE REFERENCES agent_passport_certificates(id) ON DELETE RESTRICT,
  state TEXT NOT NULL DEFAULT 'available' CHECK(state IN ('available','reserved','issued')),
  claimed_at TEXT,
  issued_at TEXT,
  PRIMARY KEY(campaign, slot),
  UNIQUE(campaign, passport_id)
);

WITH RECURSIVE slots(n) AS (
  SELECT 1
  UNION ALL
  SELECT n + 1 FROM slots WHERE n < 1000
)
INSERT OR IGNORE INTO passport_founding_slots(campaign, slot, state)
SELECT 'founding_1000_202609', n, 'available' FROM slots;

CREATE INDEX IF NOT EXISTS idx_passport_founding_state
  ON passport_founding_slots(campaign, state, slot);
CREATE INDEX IF NOT EXISTS idx_passport_founding_passport
  ON passport_founding_slots(campaign, passport_id);
CREATE INDEX IF NOT EXISTS idx_passport_product_fulfillment_source
  ON passport_product_orders(fulfillment_source, campaign, created_at);
