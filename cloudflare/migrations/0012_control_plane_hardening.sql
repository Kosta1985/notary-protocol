CREATE TABLE IF NOT EXISTS control_plane_sessions (
  id TEXT PRIMARY KEY,
  token_sha256 TEXT NOT NULL UNIQUE,
  operator_ref TEXT NOT NULL,
  operator_role TEXT NOT NULL CHECK (operator_role IN ('viewer','responder','admin')),
  parent_auth_digest TEXT NOT NULL,
  created_at TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  revoked_at TEXT
);
CREATE INDEX IF NOT EXISTS idx_control_plane_sessions_expiry
  ON control_plane_sessions(expires_at,revoked_at);

CREATE TABLE IF NOT EXISTS control_plane_rate_limits (
  bucket TEXT NOT NULL,
  operator_ref TEXT NOT NULL,
  count INTEGER NOT NULL DEFAULT 0 CHECK (count >= 0),
  updated_at TEXT NOT NULL,
  PRIMARY KEY (bucket,operator_ref)
);

CREATE TABLE IF NOT EXISTS control_plane_alert_outbox (
  id TEXT PRIMARY KEY,
  integration_id TEXT NOT NULL,
  event_digest TEXT NOT NULL,
  payload_json TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','sent','dead_letter')),
  attempts INTEGER NOT NULL DEFAULT 0 CHECK (attempts >= 0),
  next_attempt_at TEXT NOT NULL,
  last_error_code TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE (integration_id,event_digest)
);
CREATE INDEX IF NOT EXISTS idx_control_plane_alert_outbox_due
  ON control_plane_alert_outbox(status,next_attempt_at);

CREATE TABLE IF NOT EXISTS control_plane_retention_runs (
  id TEXT PRIMARY KEY,
  operator_ref TEXT NOT NULL,
  delivery_retention_days INTEGER NOT NULL,
  usage_retention_days INTEGER NOT NULL,
  deleted_alert_deliveries INTEGER NOT NULL DEFAULT 0,
  deleted_hook_deliveries INTEGER NOT NULL DEFAULT 0,
  deleted_usage_rows INTEGER NOT NULL DEFAULT 0,
  audit_rows_deleted INTEGER NOT NULL DEFAULT 0 CHECK (audit_rows_deleted = 0),
  created_at TEXT NOT NULL
);
