CREATE TABLE IF NOT EXISTS usage_daily (
  day TEXT NOT NULL,
  metric TEXT NOT NULL,
  protocol TEXT NOT NULL,
  external INTEGER NOT NULL CHECK (external IN (0, 1)),
  count INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (day, metric, protocol, external)
);

CREATE INDEX IF NOT EXISTS idx_usage_daily_metric_day
  ON usage_daily (metric, day);

CREATE INDEX IF NOT EXISTS idx_usage_daily_protocol_day
  ON usage_daily (protocol, day);
