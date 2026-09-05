CREATE TABLE IF NOT EXISTS agent_wallet_rate_windows (
  passport_id TEXT NOT NULL,
  category TEXT NOT NULL,
  window_key INTEGER NOT NULL,
  request_count INTEGER NOT NULL DEFAULT 1 CHECK (request_count >= 0),
  updated_at TEXT NOT NULL,
  PRIMARY KEY (passport_id, category, window_key),
  FOREIGN KEY (passport_id) REFERENCES agent_passports(id)
);

CREATE INDEX IF NOT EXISTS idx_wallet_rate_window_updated
  ON agent_wallet_rate_windows(updated_at DESC);
