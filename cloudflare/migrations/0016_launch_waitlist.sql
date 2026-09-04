CREATE TABLE IF NOT EXISTS launch_waitlist (
  id TEXT PRIMARY KEY,
  email TEXT NOT NULL UNIQUE,
  interest TEXT NOT NULL CHECK(interest IN ('agent_verification','validator','developer','business','enterprise')),
  source TEXT NOT NULL DEFAULT 'website',
  status TEXT NOT NULL DEFAULT 'waiting' CHECK(status IN ('waiting','invited','converted','unsubscribed')),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_launch_waitlist_status ON launch_waitlist(status, created_at);
