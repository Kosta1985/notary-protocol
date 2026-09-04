CREATE TABLE IF NOT EXISTS agent_passports (
  id TEXT PRIMARY KEY,
  public_key TEXT NOT NULL UNIQUE,
  marketplace_agent_id TEXT,
  identity_ref TEXT,
  payment_endpoint TEXT,
  payment_methods_json TEXT NOT NULL DEFAULT '[]',
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','restricted','revoked')),
  last_signed_at TEXT NOT NULL,
  last_event_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS security_events (
  id TEXT PRIMARY KEY,
  passport_id TEXT NOT NULL,
  event_type TEXT NOT NULL,
  severity INTEGER NOT NULL CHECK (severity BETWEEN 0 AND 100),
  signature_verified INTEGER NOT NULL DEFAULT 0 CHECK (signature_verified IN (0,1)),
  proof_bound INTEGER NOT NULL DEFAULT 0 CHECK (proof_bound IN (0,1)),
  recommended_action TEXT NOT NULL CHECK (recommended_action IN ('observe','challenge','restrict','isolate')),
  evidence_digest TEXT,
  proof_id TEXT,
  source TEXT NOT NULL,
  metadata_json TEXT NOT NULL DEFAULT '{}',
  observed_at TEXT NOT NULL,
  created_at TEXT NOT NULL,
  FOREIGN KEY (passport_id) REFERENCES agent_passports(id)
);

CREATE INDEX IF NOT EXISTS idx_security_events_passport_created
  ON security_events(passport_id, created_at DESC);

CREATE TABLE IF NOT EXISTS security_canaries (
  id TEXT PRIMARY KEY,
  passport_id TEXT NOT NULL,
  label TEXT NOT NULL,
  token_hash TEXT NOT NULL UNIQUE,
  active INTEGER NOT NULL DEFAULT 1 CHECK (active IN (0,1)),
  touch_count INTEGER NOT NULL DEFAULT 0,
  last_touched_at TEXT,
  created_at TEXT NOT NULL,
  FOREIGN KEY (passport_id) REFERENCES agent_passports(id)
);

CREATE INDEX IF NOT EXISTS idx_security_canaries_passport
  ON security_canaries(passport_id, created_at DESC);
