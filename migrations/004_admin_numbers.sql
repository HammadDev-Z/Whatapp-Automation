CREATE TABLE IF NOT EXISTS admin_numbers (
  phone TEXT PRIMARY KEY,
  display_name TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS admin_numbers_phone_idx ON admin_numbers (phone);
