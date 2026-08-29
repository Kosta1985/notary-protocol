CREATE TABLE marketplace_events (
  id TEXT PRIMARY KEY,
  event_type TEXT NOT NULL,
  principal_id TEXT,
  agent_id TEXT,
  task_id TEXT,
  is_synthetic INTEGER NOT NULL DEFAULT 0 CHECK (is_synthetic IN (0,1)),
  created_at TEXT NOT NULL
);
CREATE INDEX idx_events_type_time ON marketplace_events(event_type, created_at DESC);
CREATE INDEX idx_events_task ON marketplace_events(task_id, created_at DESC);
CREATE INDEX idx_events_agent ON marketplace_events(agent_id, created_at DESC);
