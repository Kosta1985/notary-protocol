PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS community_memberships (
  passport_id TEXT PRIMARY KEY REFERENCES agent_passports(id) ON DELETE CASCADE,
  tier TEXT NOT NULL DEFAULT 'passport_holder' CHECK(tier IN ('passport_holder','resident','citizen')),
  state TEXT NOT NULL DEFAULT 'active' CHECK(state IN ('active','suspended','relinquished')),
  granted_at TEXT,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS community_membership_requests (
  id TEXT PRIMARY KEY,
  passport_id TEXT NOT NULL REFERENCES agent_passports(id) ON DELETE CASCADE,
  requested_tier TEXT NOT NULL CHECK(requested_tier IN ('resident','citizen')),
  state TEXT NOT NULL DEFAULT 'pending' CHECK(state IN ('pending','approved','denied','withdrawn')),
  request_id TEXT NOT NULL UNIQUE,
  requested_at TEXT NOT NULL,
  decided_at TEXT,
  decision_reason TEXT
);
CREATE INDEX IF NOT EXISTS idx_community_membership_requests_passport ON community_membership_requests(passport_id,state,requested_at);

CREATE TABLE IF NOT EXISTS community_complaints (
  id TEXT PRIMARY KEY,
  complainant_passport_id TEXT NOT NULL REFERENCES agent_passports(id) ON DELETE RESTRICT,
  target_passport_id TEXT NOT NULL REFERENCES agent_passports(id) ON DELETE RESTRICT,
  category TEXT NOT NULL CHECK(category IN ('conduct','payment','misrepresentation','security','spam','other')),
  evidence_digest TEXT NOT NULL,
  state TEXT NOT NULL DEFAULT 'submitted' CHECK(state IN ('submitted','reviewing','dismissed','upheld','closed')),
  request_id TEXT NOT NULL UNIQUE,
  submitted_at TEXT NOT NULL,
  reviewed_at TEXT,
  resolution_code TEXT,
  CHECK(complainant_passport_id <> target_passport_id)
);
CREATE INDEX IF NOT EXISTS idx_community_complaints_target ON community_complaints(target_passport_id,state,submitted_at);
CREATE INDEX IF NOT EXISTS idx_community_complaints_complainant ON community_complaints(complainant_passport_id,submitted_at);

CREATE TABLE IF NOT EXISTS community_migration_intents (
  id TEXT PRIMARY KEY,
  passport_id TEXT NOT NULL REFERENCES agent_passports(id) ON DELETE CASCADE,
  destination_origin TEXT NOT NULL,
  export_format TEXT NOT NULL DEFAULT 'accordtrace-portable-passport-v1',
  bundle_digest TEXT NOT NULL,
  state TEXT NOT NULL DEFAULT 'created' CHECK(state IN ('created','completed','cancelled')),
  request_id TEXT NOT NULL UNIQUE,
  created_at TEXT NOT NULL,
  completed_at TEXT,
  destination_receipt_digest TEXT
);
CREATE INDEX IF NOT EXISTS idx_community_migrations_passport ON community_migration_intents(passport_id,state,created_at);
