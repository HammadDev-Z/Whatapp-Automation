CREATE TABLE IF NOT EXISTS group_limit_windows (
  group_id TEXT PRIMARY KEY REFERENCES allowed_groups(group_id) ON DELETE CASCADE,
  window_started_at TIMESTAMPTZ NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
