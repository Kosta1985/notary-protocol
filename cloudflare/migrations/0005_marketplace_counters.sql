CREATE TABLE IF NOT EXISTS marketplace_events (
  id TEXT PRIMARY KEY,
  event_type TEXT NOT NULL,
  agent_id TEXT,
  task_id TEXT,
  source TEXT NOT NULL DEFAULT 'direct',
  occurred_at TEXT NOT NULL,
  FOREIGN KEY (agent_id) REFERENCES marketplace_agents(id),
  FOREIGN KEY (task_id) REFERENCES marketplace_tasks(id)
);

CREATE INDEX IF NOT EXISTS idx_marketplace_events_type_time
  ON marketplace_events(event_type, occurred_at DESC);
CREATE INDEX IF NOT EXISTS idx_marketplace_events_agent_time
  ON marketplace_events(agent_id, occurred_at DESC);
CREATE INDEX IF NOT EXISTS idx_marketplace_events_task_time
  ON marketplace_events(task_id, occurred_at DESC);
CREATE INDEX IF NOT EXISTS idx_marketplace_events_source_time
  ON marketplace_events(source, occurred_at DESC);

CREATE TABLE IF NOT EXISTS marketplace_daily_counters (
  day TEXT NOT NULL,
  metric TEXT NOT NULL,
  dimension TEXT NOT NULL DEFAULT 'all',
  count INTEGER NOT NULL DEFAULT 0 CHECK (count >= 0),
  PRIMARY KEY (day, metric, dimension)
);

CREATE INDEX IF NOT EXISTS idx_marketplace_daily_metric_day
  ON marketplace_daily_counters(metric, day DESC);
