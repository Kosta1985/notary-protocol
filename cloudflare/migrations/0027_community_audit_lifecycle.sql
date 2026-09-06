PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS community_audit_events (
  id TEXT PRIMARY KEY,
  event_type TEXT NOT NULL CHECK(event_type IN (
    'membership_requested','membership_approved','membership_denied',
    'complaint_submitted','complaint_reviewed','complaint_dismissed','complaint_upheld','complaint_closed',
    'migration_created','migration_completed','migration_cancelled'
  )),
  passport_id TEXT REFERENCES agent_passports(id) ON DELETE SET NULL,
  subject_ref TEXT NOT NULL,
  actor_kind TEXT NOT NULL CHECK(actor_kind IN ('passport','community_admin')),
  event_digest TEXT NOT NULL UNIQUE,
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_community_audit_passport ON community_audit_events(passport_id,created_at);
CREATE INDEX IF NOT EXISTS idx_community_audit_subject ON community_audit_events(subject_ref,created_at);
