CREATE TABLE IF NOT EXISTS agent_passports (
  agent_id TEXT PRIMARY KEY,
  identity_ref TEXT,
  payment_endpoint TEXT,
  payment_methods_json TEXT NOT NULL DEFAULT '[]',
  status TEXT NOT NULL DEFAULT 'active',
  last_event_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS security_events (
  id TEXT PRIMARY KEY,
  agent_id TEXT NOT NULL,
  event_type TEXT NOT NULL,
  severity INTEGER NOT NULL CHECK (severity BETWEEN 0 AND 100),
  verified INTEGER NOT NULL DEFAULT 0 CHECK (verified IN (0,1)),
  trust_delta INTEGER NOT NULL DEFAULT 0,
  recommended_action TEXT NOT NULL CHECK (recommended_action IN ('observe','challenge','restrict','isolate','revoke','recover')),
  evidence_digest TEXT,
  proof_id TEXT,
  source TEXT NOT NULL DEFAULT 'self-report',
  metadata_json TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL,
  FOREIGN KEY (agent_id) REFERENCES marketplace_agents(id)
);

CREATE INDEX IF NOT EXISTS idx_security_events_agent_created
  ON security_events(agent_id, created_at DESC);

CREATE TABLE IF NOT EXISTS security_canaries (
  id TEXT PRIMARY KEY,
  agent_id TEXT,
  label TEXT NOT NULL,
  token_hash TEXT NOT NULL UNIQUE,
  active INTEGER NOT NULL DEFAULT 1 CHECK (active IN (0,1)),
  touch_count INTEGER NOT NULL DEFAULT 0,
  last_touched_at TEXT,
  created_at TEXT NOT NULL,
  FOREIGN KEY (agent_id) REFERENCES marketplace_agents(id)
);

CREATE INDEX IF NOT EXISTS idx_security_canaries_agent
  ON security_canaries(agent_id, created_at DESC);
