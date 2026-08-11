CREATE TABLE IF NOT EXISTS group_category_limits (
  group_id TEXT NOT NULL REFERENCES allowed_groups(group_id) ON DELETE CASCADE,
  category TEXT NOT NULL REFERENCES code_categories(category) ON UPDATE CASCADE ON DELETE CASCADE,
  daily_limit INTEGER NOT NULL CHECK (daily_limit > 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY(group_id, category)
);

CREATE INDEX IF NOT EXISTS group_category_limits_group_idx
ON group_category_limits(group_id);
