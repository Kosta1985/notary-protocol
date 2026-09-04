CREATE TABLE IF NOT EXISTS identity_attestations (
  id TEXT PRIMARY KEY,
  attestor_passport_id TEXT NOT NULL,
  subject_passport_id TEXT NOT NULL,
  type TEXT NOT NULL CHECK (type IN ('verified_domain','organization','software_publisher','security_evaluator','payment_rail_identity')),
  subject_ref TEXT NOT NULL,
  evidence_digest TEXT,
  issued_at TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  signature TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','revoked')),
  revoked_at TEXT,
  revoke_reason TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  CHECK (attestor_passport_id <> subject_passport_id),
  FOREIGN KEY (attestor_passport_id) REFERENCES agent_passports(id),
  FOREIGN KEY (subject_passport_id) REFERENCES agent_passports(id)
);
CREATE INDEX IF NOT EXISTS idx_identity_subject ON identity_attestations(subject_passport_id,status,expires_at);
CREATE INDEX IF NOT EXISTS idx_identity_attestor ON identity_attestations(attestor_passport_id,status,expires_at);
