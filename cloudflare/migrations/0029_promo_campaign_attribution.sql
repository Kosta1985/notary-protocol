ALTER TABLE launch_waitlist ADD COLUMN campaign TEXT;
ALTER TABLE launch_waitlist ADD COLUMN channel TEXT;
ALTER TABLE launch_waitlist ADD COLUMN medium TEXT;

CREATE TABLE IF NOT EXISTS campaign_daily (
  day TEXT NOT NULL,
  campaign TEXT NOT NULL,
  channel TEXT NOT NULL,
  medium TEXT NOT NULL,
  event TEXT NOT NULL CHECK(event IN ('landing_view','start_click','developer_click','waitlist_submit')),
  count INTEGER NOT NULL DEFAULT 0 CHECK(count >= 0),
  PRIMARY KEY(day,campaign,channel,medium,event)
);

CREATE INDEX IF NOT EXISTS idx_launch_waitlist_campaign ON launch_waitlist(campaign,channel,medium,status);
CREATE INDEX IF NOT EXISTS idx_campaign_daily_campaign ON campaign_daily(campaign,day,event);
