CREATE TABLE IF NOT EXISTS agent_activity_daily (
  day TEXT NOT NULL,
  agent_hash TEXT NOT NULL,
  protocol TEXT NOT NULL,
  client TEXT,
  first_seen_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  last_seen_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  request_count INTEGER NOT NULL DEFAULT 1,
  PRIMARY KEY (day, agent_hash, protocol)
);

CREATE INDEX IF NOT EXISTS idx_agent_activity_agent_day
  ON agent_activity_daily (agent_hash, day);

CREATE INDEX IF NOT EXISTS idx_agent_activity_protocol_day
  ON agent_activity_daily (protocol, day);

CREATE TABLE IF NOT EXISTS agent_requests_daily (
  day TEXT NOT NULL,
  protocol TEXT NOT NULL,
  identified INTEGER NOT NULL DEFAULT 0,
  anonymous INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (day, protocol)
);
