CREATE TABLE IF NOT EXISTS service_offers (
  id TEXT PRIMARY KEY,
  seller_passport_id TEXT NOT NULL,
  service_action TEXT NOT NULL,
  target_origin TEXT NOT NULL,
  rail TEXT NOT NULL CHECK (rail IN ('x402')),
  network TEXT NOT NULL,
  asset TEXT NOT NULL,
  amount_atomic TEXT NOT NULL,
  platform_fee_atomic TEXT NOT NULL DEFAULT '0',
  pay_to TEXT NOT NULL,
  valid_from TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  terms_digest TEXT,
  signature TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','revoked')),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (seller_passport_id) REFERENCES agent_passports(id)
);
CREATE INDEX IF NOT EXISTS idx_service_offers_seller_status
  ON service_offers(seller_passport_id, status, expires_at);

CREATE TABLE IF NOT EXISTS service_orders (
  id TEXT PRIMARY KEY,
  offer_id TEXT NOT NULL,
  buyer_passport_id TEXT NOT NULL,
  seller_passport_id TEXT NOT NULL,
  lease_id TEXT NOT NULL UNIQUE,
  payment_status TEXT NOT NULL DEFAULT 'payment_claim' CHECK (payment_status IN ('payment_claim','payment_authorized','settlement_verified','rejected','consumed')),
  payment_payload_digest TEXT,
  payment_requirements_digest TEXT,
  payment_reference_digest TEXT,
  facilitator TEXT,
  payer_ref TEXT,
  buyer_signature TEXT NOT NULL,
  ordered_at TEXT NOT NULL,
  authorized_at TEXT,
  consumed_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (offer_id) REFERENCES service_offers(id),
  FOREIGN KEY (buyer_passport_id) REFERENCES agent_passports(id),
  FOREIGN KEY (seller_passport_id) REFERENCES agent_passports(id),
  FOREIGN KEY (lease_id) REFERENCES capability_leases(id)
);
CREATE INDEX IF NOT EXISTS idx_service_orders_buyer_status
  ON service_orders(buyer_passport_id, payment_status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_service_orders_offer
  ON service_orders(offer_id, created_at DESC);
