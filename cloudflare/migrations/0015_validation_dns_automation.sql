CREATE TABLE IF NOT EXISTS validation_domain_challenges (
  request_id TEXT PRIMARY KEY,
  subject_passport_id TEXT NOT NULL,
  domain_name TEXT NOT NULL,
  dns_name TEXT NOT NULL,
  record_value_digest TEXT NOT NULL,
  challenge_digest TEXT NOT NULL UNIQUE,
  issued_at TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  verified_at TEXT,
  evidence_digest TEXT,
  resolver TEXT,
  dnssec_authenticated INTEGER NOT NULL DEFAULT 0 CHECK(dnssec_authenticated IN (0,1)),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_validation_domain_challenges_subject
  ON validation_domain_challenges(subject_passport_id, verified_at, expires_at);

CREATE INDEX IF NOT EXISTS idx_validation_domain_challenges_expiry
  ON validation_domain_challenges(expires_at, verified_at);
