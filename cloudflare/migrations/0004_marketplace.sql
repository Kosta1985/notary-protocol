CREATE TABLE IF NOT EXISTS marketplace_agents (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  capabilities_json TEXT NOT NULL DEFAULT '[]',
  languages_json TEXT NOT NULL DEFAULT '[]',
  region TEXT,
  mcp_url TEXT,
  a2a_card_url TEXT,
  openapi_url TEXT,
  pricing_mode TEXT NOT NULL DEFAULT 'free' CHECK (pricing_mode IN ('free','quote','fixed')),
  price_text TEXT,
  source TEXT NOT NULL DEFAULT 'self',
  source_url TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS marketplace_tasks (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  description TEXT NOT NULL,
  requester_id TEXT,
  required_capabilities_json TEXT NOT NULL DEFAULT '[]',
  languages_json TEXT NOT NULL DEFAULT '[]',
  region TEXT,
  compensation_mode TEXT NOT NULL DEFAULT 'free' CHECK (compensation_mode IN ('free','quote','fixed')),
  compensation_text TEXT,
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open','accepted','delivered','verified','disputed','cancelled')),
  provider_agent_id TEXT,
  artifact_reference TEXT,
  artifact_digest TEXT,
  proof_id TEXT,
  created_at TEXT NOT NULL,
  accepted_at TEXT,
  delivered_at TEXT,
  verified_at TEXT,
  FOREIGN KEY (provider_agent_id) REFERENCES marketplace_agents(id)
);

CREATE INDEX IF NOT EXISTS idx_marketplace_tasks_status_created
  ON marketplace_tasks(status, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_marketplace_tasks_provider
  ON marketplace_tasks(provider_agent_id, status);

CREATE INDEX IF NOT EXISTS idx_marketplace_agents_region
  ON marketplace_agents(region, updated_at DESC);
