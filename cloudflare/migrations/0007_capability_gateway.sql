CREATE TABLE IF NOT EXISTS capability_leases (
  id TEXT PRIMARY KEY,
  issuer_passport_id TEXT NOT NULL,
  subject_passport_id TEXT NOT NULL,
  allowed_actions_json TEXT NOT NULL,
  allowed_origins_json TEXT NOT NULL,
  max_calls INTEGER NOT NULL CHECK (max_calls BETWEEN 1 AND 1000000),
  used_calls INTEGER NOT NULL DEFAULT 0 CHECK (used_calls >= 0),
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','revoked')),
  issued_at TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  signature TEXT NOT NULL,
  revoked_at TEXT,
  revoke_reason TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (issuer_passport_id) REFERENCES agent_passports(id),
  FOREIGN KEY (subject_passport_id) REFERENCES agent_passports(id)
);
CREATE INDEX IF NOT EXISTS idx_capability_leases_subject
  ON capability_leases(subject_passport_id, status, expires_at);

CREATE TABLE IF NOT EXISTS gateway_requests (
  id TEXT PRIMARY KEY,
  request_digest TEXT NOT NULL,
  lease_id TEXT NOT NULL,
  subject_passport_id TEXT NOT NULL,
  action TEXT NOT NULL,
  target_origin TEXT NOT NULL,
  observed_at TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('pending','decided')),
  decision_id TEXT,
  created_at TEXT NOT NULL,
  FOREIGN KEY (subject_passport_id) REFERENCES agent_passports(id)
);

CREATE TABLE IF NOT EXISTS gateway_decisions (
  id TEXT PRIMARY KEY,
  request_id TEXT NOT NULL UNIQUE,
  lease_id TEXT NOT NULL,
  subject_passport_id TEXT NOT NULL,
  action TEXT NOT NULL,
  target_origin TEXT NOT NULL,
  allowed INTEGER NOT NULL CHECK (allowed IN (0,1)),
  reason TEXT NOT NULL,
  remaining_calls INTEGER NOT NULL CHECK (remaining_calls >= 0),
  decided_at TEXT NOT NULL,
  created_at TEXT NOT NULL,
  FOREIGN KEY (request_id) REFERENCES gateway_requests(id),
  FOREIGN KEY (subject_passport_id) REFERENCES agent_passports(id)
);
CREATE INDEX IF NOT EXISTS idx_gateway_decisions_lease
  ON gateway_decisions(lease_id, created_at DESC);
