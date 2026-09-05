-- Local reference schema ONLY. Deliberately outside cloudflare/migrations.
PRAGMA foreign_keys = ON;
CREATE TABLE IF NOT EXISTS rh_agents (
  agent_id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  membership TEXT NOT NULL DEFAULT 'passport_only' CHECK(membership IN ('passport_only','resident')),
  billing TEXT NOT NULL DEFAULT 'trial' CHECK(billing IN ('trial','active','past_due','cancelled')),
  runtime TEXT NOT NULL DEFAULT 'offline' CHECK(runtime IN ('offline','idle','running_external','restoring','stopped_by_operator')),
  credential TEXT NOT NULL DEFAULT 'active' CHECK(credential IN ('active','suspended','revoked')),
  public_opt_in INTEGER NOT NULL DEFAULT 0 CHECK(public_opt_in IN (0,1)),
  current_snapshot TEXT,
  export_until INTEGER NOT NULL DEFAULT 0,
  UNIQUE(tenant_id,agent_id)
);
CREATE TABLE IF NOT EXISTS rh_sessions (
  token_hash TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  agent_id TEXT NOT NULL,
  expires_at INTEGER NOT NULL,
  revoked INTEGER NOT NULL DEFAULT 0 CHECK(revoked IN (0,1)),
  FOREIGN KEY(tenant_id,agent_id) REFERENCES rh_agents(tenant_id,agent_id)
);
CREATE TABLE IF NOT EXISTS rh_limits (
  scope TEXT NOT NULL,
  resource TEXT NOT NULL,
  ceiling INTEGER NOT NULL CHECK(ceiling>=0),
  used INTEGER NOT NULL DEFAULT 0 CHECK(used>=0),
  reserved INTEGER NOT NULL DEFAULT 0 CHECK(reserved>=0),
  reset_at INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY(scope,resource),
  CHECK(used+reserved<=ceiling)
);
CREATE TABLE IF NOT EXISTS rh_reservations (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  agent_id TEXT NOT NULL,
  kind TEXT NOT NULL CHECK(kind IN ('snapshot','message')),
  dedupe_key TEXT NOT NULL,
  digest TEXT NOT NULL,
  object_key TEXT NOT NULL UNIQUE,
  bytes INTEGER NOT NULL CHECK(bytes>0),
  status TEXT NOT NULL CHECK(status IN ('pending','committed','aborted')),
  expires_at INTEGER NOT NULL,
  UNIQUE(tenant_id,agent_id,kind,dedupe_key),
  FOREIGN KEY(tenant_id,agent_id) REFERENCES rh_agents(tenant_id,agent_id)
);
CREATE INDEX IF NOT EXISTS rh_reservation_expiry ON rh_reservations(status,expires_at,id);
CREATE TABLE IF NOT EXISTS rh_objects (
  id TEXT PRIMARY KEY REFERENCES rh_reservations(id),
  tenant_id TEXT NOT NULL,
  agent_id TEXT NOT NULL,
  kind TEXT NOT NULL CHECK(kind IN ('snapshot','message')),
  object_key TEXT NOT NULL UNIQUE,
  bytes INTEGER NOT NULL,
  manifest_json TEXT NOT NULL,
  manifest_sha TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  FOREIGN KEY(tenant_id,agent_id) REFERENCES rh_agents(tenant_id,agent_id)
);
CREATE INDEX IF NOT EXISTS rh_object_page ON rh_objects(tenant_id,agent_id,kind,created_at,id);
CREATE TABLE IF NOT EXISTS rh_outbox (
  message_id TEXT PRIMARY KEY REFERENCES rh_objects(id),
  tenant_id TEXT NOT NULL,
  agent_id TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','acked','dead')),
  attempts INTEGER NOT NULL DEFAULT 0 CHECK(attempts BETWEEN 0 AND 3),
  FOREIGN KEY(tenant_id,agent_id) REFERENCES rh_agents(tenant_id,agent_id)
);
CREATE INDEX IF NOT EXISTS rh_outbox_page ON rh_outbox(tenant_id,agent_id,status,message_id);
CREATE TABLE IF NOT EXISTS rh_tombstones (
  object_id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  agent_id TEXT NOT NULL,
  deleted_at INTEGER NOT NULL
);
