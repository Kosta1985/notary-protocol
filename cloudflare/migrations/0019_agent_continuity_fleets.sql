CREATE TABLE IF NOT EXISTS continuity_fleets (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  owner_ref TEXT NOT NULL,
  plan TEXT NOT NULL DEFAULT 'enterprise',
  status TEXT NOT NULL DEFAULT 'active' CHECK(status IN ('active','paused','retired')),
  scan_interval_minutes INTEGER NOT NULL DEFAULT 15 CHECK(scan_interval_minutes BETWEEN 5 AND 1440),
  last_scan_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS continuity_fleet_members (
  fleet_id TEXT NOT NULL,
  passport_id TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'active' CHECK(status IN ('active','paused','removed')),
  heartbeat_expected_minutes INTEGER CHECK(heartbeat_expected_minutes IS NULL OR heartbeat_expected_minutes BETWEEN 5 AND 10080),
  last_heartbeat_at TEXT,
  last_assessed_at TEXT,
  last_classification TEXT CHECK(last_classification IS NULL OR last_classification IN ('observed','attention','containment_recommended')),
  last_signal_digest TEXT,
  added_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  PRIMARY KEY(fleet_id,passport_id),
  FOREIGN KEY(fleet_id) REFERENCES continuity_fleets(id),
  FOREIGN KEY(passport_id) REFERENCES agent_passports(id)
);
CREATE INDEX IF NOT EXISTS idx_continuity_members_status ON continuity_fleet_members(fleet_id,status);

CREATE TABLE IF NOT EXISTS continuity_assessments (
  id TEXT PRIMARY KEY,
  fleet_id TEXT,
  passport_id TEXT NOT NULL,
  classification TEXT NOT NULL CHECK(classification IN ('observed','attention','containment_recommended')),
  reasons_json TEXT NOT NULL,
  signals_json TEXT NOT NULL,
  signal_digest TEXT NOT NULL,
  generated_at TEXT NOT NULL,
  FOREIGN KEY(fleet_id) REFERENCES continuity_fleets(id),
  FOREIGN KEY(passport_id) REFERENCES agent_passports(id)
);
CREATE INDEX IF NOT EXISTS idx_continuity_assessment_passport ON continuity_assessments(passport_id,generated_at);
CREATE INDEX IF NOT EXISTS idx_continuity_assessment_fleet ON continuity_assessments(fleet_id,generated_at);

CREATE TABLE IF NOT EXISTS continuity_incidents (
  id TEXT PRIMARY KEY,
  fleet_id TEXT NOT NULL,
  passport_id TEXT NOT NULL,
  assessment_id TEXT NOT NULL,
  classification TEXT NOT NULL CHECK(classification IN ('attention','containment_recommended')),
  state TEXT NOT NULL DEFAULT 'open' CHECK(state IN ('open','acknowledged','resolved')),
  reasons_json TEXT NOT NULL,
  opened_at TEXT NOT NULL,
  acknowledged_at TEXT,
  resolved_at TEXT,
  updated_at TEXT NOT NULL,
  FOREIGN KEY(fleet_id) REFERENCES continuity_fleets(id),
  FOREIGN KEY(passport_id) REFERENCES agent_passports(id),
  FOREIGN KEY(assessment_id) REFERENCES continuity_assessments(id)
);
CREATE INDEX IF NOT EXISTS idx_continuity_incidents_open ON continuity_incidents(fleet_id,state,updated_at);
CREATE INDEX IF NOT EXISTS idx_continuity_incidents_passport ON continuity_incidents(passport_id,state,updated_at);

CREATE TABLE IF NOT EXISTS continuity_metered_days (
  usage_date TEXT NOT NULL,
  fleet_id TEXT NOT NULL,
  passport_id TEXT NOT NULL,
  created_at TEXT NOT NULL,
  PRIMARY KEY(usage_date,fleet_id,passport_id),
  FOREIGN KEY(fleet_id) REFERENCES continuity_fleets(id),
  FOREIGN KEY(passport_id) REFERENCES agent_passports(id)
);
