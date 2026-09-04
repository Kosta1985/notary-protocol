CREATE TABLE IF NOT EXISTS attestor_safety_profiles (
  passport_id TEXT PRIMARY KEY,
  recovery_public_key TEXT NOT NULL UNIQUE,
  recovery_key_fingerprint TEXT NOT NULL,
  state TEXT NOT NULL DEFAULT 'active' CHECK (state IN ('active','suspended','compromised','revoked')),
  enrolled_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  compromised_at TEXT,
  revoked_at TEXT,
  replacement_passport_id TEXT,
  FOREIGN KEY (passport_id) REFERENCES agent_passports(id),
  FOREIGN KEY (replacement_passport_id) REFERENCES agent_passports(id)
);
CREATE INDEX IF NOT EXISTS idx_attestor_safety_state ON attestor_safety_profiles(state,updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_attestor_recovery_fingerprint ON attestor_safety_profiles(recovery_key_fingerprint,state);

CREATE TABLE IF NOT EXISTS attestor_state_events (
  id TEXT PRIMARY KEY,
  passport_id TEXT NOT NULL,
  from_state TEXT NOT NULL,
  to_state TEXT NOT NULL,
  reason TEXT,
  signed_by TEXT NOT NULL CHECK (signed_by IN ('passport','recovery')),
  signature TEXT NOT NULL,
  observed_at TEXT NOT NULL,
  created_at TEXT NOT NULL,
  FOREIGN KEY (passport_id) REFERENCES agent_passports(id)
);
CREATE INDEX IF NOT EXISTS idx_attestor_state_events_passport ON attestor_state_events(passport_id,created_at DESC);

CREATE TABLE IF NOT EXISTS attestor_relationship_attestations (
  id TEXT PRIMARY KEY,
  attestor_passport_id TEXT NOT NULL,
  subject_passport_id TEXT NOT NULL,
  relationship TEXT NOT NULL CHECK (relationship IN ('independent','related','unknown')),
  scope TEXT NOT NULL DEFAULT 'operator_control',
  issued_at TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  signature TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','revoked')),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  CHECK (attestor_passport_id <> subject_passport_id),
  FOREIGN KEY (attestor_passport_id) REFERENCES agent_passports(id),
  FOREIGN KEY (subject_passport_id) REFERENCES agent_passports(id)
);
CREATE INDEX IF NOT EXISTS idx_attestor_relationship_subject ON attestor_relationship_attestations(subject_passport_id,status,expires_at);
