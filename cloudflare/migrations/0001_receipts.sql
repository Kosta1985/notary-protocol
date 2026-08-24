CREATE TABLE IF NOT EXISTS receipts (
  id TEXT PRIMARY KEY,
  deal_id TEXT NOT NULL,
  evidence_digest TEXT NOT NULL,
  valid INTEGER NOT NULL CHECK (valid IN (0, 1)),
  verified_at TEXT NOT NULL,
  receipt TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS receipts_deal_id_idx ON receipts (deal_id);
CREATE INDEX IF NOT EXISTS receipts_verified_at_idx ON receipts (verified_at);
