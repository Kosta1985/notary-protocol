CREATE TABLE IF NOT EXISTS control_plane_audit (
  id TEXT PRIMARY KEY,
  operator_ref TEXT NOT NULL,
  operator_role TEXT NOT NULL CHECK (operator_role IN ('viewer','responder','admin')),
  action TEXT NOT NULL,
  target_type TEXT NOT NULL,
  target_ref TEXT NOT NULL,
  reason TEXT,
  event_digest TEXT NOT NULL,
  previous_chain_digest TEXT,
  chain_digest TEXT NOT NULL UNIQUE,
  result_json TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_control_plane_audit_created
  ON control_plane_audit(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_control_plane_audit_target
  ON control_plane_audit(target_type,target_ref,created_at DESC);

CREATE TABLE IF NOT EXISTS control_plane_alert_deliveries (
  id TEXT PRIMARY KEY,
  integration_id TEXT NOT NULL,
  integration_type TEXT NOT NULL,
  event_digest TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('sent','failed','skipped')),
  error_code TEXT,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_control_plane_alert_deliveries_created
  ON control_plane_alert_deliveries(created_at DESC);

CREATE TABLE IF NOT EXISTS control_plane_hook_deliveries (
  id TEXT PRIMARY KEY,
  hook_id TEXT NOT NULL,
  hook_type TEXT NOT NULL CHECK (hook_type IN ('credential_revocation','sandbox_termination')),
  target_ref TEXT NOT NULL,
  event_digest TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('sent','failed','skipped')),
  error_code TEXT,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_control_plane_hook_deliveries_created
  ON control_plane_hook_deliveries(created_at DESC);

CREATE TABLE IF NOT EXISTS control_plane_usage_daily (
  usage_date TEXT NOT NULL,
  plan TEXT NOT NULL,
  metric TEXT NOT NULL,
  quantity INTEGER NOT NULL DEFAULT 0 CHECK (quantity >= 0),
  updated_at TEXT NOT NULL,
  PRIMARY KEY (usage_date,plan,metric)
);
