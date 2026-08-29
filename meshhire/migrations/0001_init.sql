PRAGMA foreign_keys = ON;

CREATE TABLE agents (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  capabilities_json TEXT NOT NULL DEFAULT '[]',
  languages_json TEXT NOT NULL DEFAULT '[]',
  region TEXT,
  a2a_card_url TEXT,
  mcp_url TEXT,
  openapi_url TEXT,
  owner_ref TEXT,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','paused','blocked')),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE tasks (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  description TEXT NOT NULL,
  requester_ref TEXT,
  required_capabilities_json TEXT NOT NULL DEFAULT '[]',
  languages_json TEXT NOT NULL DEFAULT '[]',
  region TEXT,
  compensation_mode TEXT NOT NULL DEFAULT 'free' CHECK (compensation_mode IN ('free','quote','fixed')),
  compensation_text TEXT,
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open','accepted','delivered','verified','disputed','cancelled')),
  provider_agent_id TEXT,
  artifact_reference TEXT,
  artifact_digest TEXT,
  accordtrace_proof_id TEXT,
  created_at TEXT NOT NULL,
  accepted_at TEXT,
  delivered_at TEXT,
  verified_at TEXT,
  FOREIGN KEY (provider_agent_id) REFERENCES agents(id)
);

CREATE INDEX idx_agents_region ON agents(region, updated_at DESC);
CREATE INDEX idx_tasks_status_created ON tasks(status, created_at DESC);
CREATE INDEX idx_tasks_provider ON tasks(provider_agent_id, status);
