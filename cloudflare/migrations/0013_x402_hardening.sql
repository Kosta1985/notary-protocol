CREATE TABLE IF NOT EXISTS x402_order_requirements (
  order_id TEXT PRIMARY KEY,
  requirements_json TEXT NOT NULL,
  requirements_digest TEXT NOT NULL,
  created_at TEXT NOT NULL,
  FOREIGN KEY (order_id) REFERENCES service_orders(id)
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_x402_requirements_digest_order
  ON x402_order_requirements(order_id,requirements_digest);

CREATE TABLE IF NOT EXISTS x402_payment_payload_replays (
  payment_payload_digest TEXT PRIMARY KEY,
  order_id TEXT NOT NULL,
  first_seen_at TEXT NOT NULL,
  FOREIGN KEY (order_id) REFERENCES service_orders(id)
);
CREATE INDEX IF NOT EXISTS idx_x402_replays_order
  ON x402_payment_payload_replays(order_id,first_seen_at DESC);

CREATE TABLE IF NOT EXISTS x402_facilitator_support_cache (
  facilitator_digest TEXT NOT NULL,
  scheme TEXT NOT NULL,
  network TEXT NOT NULL,
  x402_version INTEGER NOT NULL,
  supported INTEGER NOT NULL CHECK (supported IN (0,1)),
  checked_at TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  response_digest TEXT,
  PRIMARY KEY (facilitator_digest,scheme,network,x402_version)
);
CREATE INDEX IF NOT EXISTS idx_x402_support_expiry
  ON x402_facilitator_support_cache(expires_at);
