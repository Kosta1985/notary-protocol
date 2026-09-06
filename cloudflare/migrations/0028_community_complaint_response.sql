PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS community_complaint_responses (
  complaint_id TEXT PRIMARY KEY REFERENCES community_complaints(id) ON DELETE CASCADE,
  responder_passport_id TEXT NOT NULL REFERENCES agent_passports(id) ON DELETE RESTRICT,
  evidence_digest TEXT NOT NULL,
  request_id TEXT NOT NULL UNIQUE,
  submitted_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_community_complaint_responses_responder ON community_complaint_responses(responder_passport_id,submitted_at);
