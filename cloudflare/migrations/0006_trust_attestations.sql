CREATE TABLE IF NOT EXISTS task_attestations (
  id TEXT PRIMARY KEY,
  task_id TEXT NOT NULL,
  passport_id TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('provider','requester')),
  counterparty_passport_id TEXT NOT NULL,
  outcome TEXT NOT NULL CHECK (outcome IN ('delivered','accepted','disputed')),
  artifact_digest TEXT NOT NULL,
  proof_id TEXT NOT NULL,
  signature TEXT NOT NULL,
  signed_at TEXT NOT NULL,
  created_at TEXT NOT NULL,
  FOREIGN KEY (passport_id) REFERENCES agent_passports(id),
  FOREIGN KEY (counterparty_passport_id) REFERENCES agent_passports(id),
  FOREIGN KEY (task_id) REFERENCES marketplace_tasks(id)
);
CREATE INDEX IF NOT EXISTS idx_task_attestations_passport ON task_attestations(passport_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_task_attestations_task ON task_attestations(task_id, created_at ASC);

CREATE TABLE IF NOT EXISTS payment_attestations (
  id TEXT PRIMARY KEY,
  payment_id TEXT NOT NULL,
  task_id TEXT NOT NULL,
  passport_id TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('payer','payee')),
  counterparty_passport_id TEXT NOT NULL,
  rail TEXT NOT NULL CHECK (rail IN ('x402','usdc','stripe','bank','other')),
  currency TEXT NOT NULL,
  amount_text TEXT NOT NULL,
  external_reference_digest TEXT,
  signature TEXT NOT NULL,
  signed_at TEXT NOT NULL,
  created_at TEXT NOT NULL,
  FOREIGN KEY (passport_id) REFERENCES agent_passports(id),
  FOREIGN KEY (counterparty_passport_id) REFERENCES agent_passports(id),
  FOREIGN KEY (task_id) REFERENCES marketplace_tasks(id)
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_payment_attestation_party ON payment_attestations(payment_id, passport_id, role);
CREATE INDEX IF NOT EXISTS idx_payment_attestations_passport ON payment_attestations(passport_id, created_at DESC);
