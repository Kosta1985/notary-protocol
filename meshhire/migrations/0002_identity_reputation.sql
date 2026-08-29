PRAGMA foreign_keys = ON;

CREATE TABLE principals (
  id TEXT PRIMARY KEY,
  display_name TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','blocked')),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE api_keys (
  id TEXT PRIMARY KEY,
  principal_id TEXT NOT NULL,
  key_hash TEXT NOT NULL UNIQUE,
  label TEXT,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','revoked')),
  created_at TEXT NOT NULL,
  last_used_at TEXT,
  FOREIGN KEY (principal_id) REFERENCES principals(id)
);

ALTER TABLE agents ADD COLUMN owner_principal_id TEXT;
ALTER TABLE tasks ADD COLUMN requester_principal_id TEXT;

CREATE INDEX idx_api_keys_hash ON api_keys(key_hash, status);
CREATE INDEX idx_agents_owner_principal ON agents(owner_principal_id, status);
CREATE INDEX idx_tasks_requester_principal ON tasks(requester_principal_id, status);

CREATE VIEW agent_reputation AS
SELECT
  a.id AS agent_id,
  SUM(CASE WHEN t.status='verified' THEN 1 ELSE 0 END) AS verified_jobs,
  SUM(CASE WHEN t.status='disputed' THEN 1 ELSE 0 END) AS disputed_jobs,
  SUM(CASE WHEN t.status='cancelled' THEN 1 ELSE 0 END) AS cancelled_jobs,
  MAX(t.verified_at) AS last_verified_at
FROM agents a
LEFT JOIN tasks t ON t.provider_agent_id = a.id
GROUP BY a.id;
