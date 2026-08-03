CREATE TABLE IF NOT EXISTS codes (
  id BIGSERIAL PRIMARY KEY,
  category TEXT NOT NULL CHECK (category = lower(category) AND category ~ '^[a-z0-9_-]+$'),
  code TEXT NOT NULL UNIQUE CHECK (btrim(code) <> ''),
  status TEXT NOT NULL DEFAULT 'unused' CHECK (status IN ('unused', 'reserved', 'used')),
  used_by_group TEXT,
  requested_by TEXT,
  request_message_id TEXT,
  used_at TIMESTAMPTZ,
  delivery_status TEXT CHECK (delivery_status IN ('pending', 'sent', 'failed')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK ((status = 'unused' AND delivery_status IS NULL) OR status IN ('reserved', 'used'))
);

CREATE INDEX IF NOT EXISTS codes_available_idx ON codes (category, id) WHERE status = 'unused';
CREATE INDEX IF NOT EXISTS codes_delivery_idx ON codes (delivery_status, used_at) WHERE delivery_status IN ('pending', 'failed');
CREATE INDEX IF NOT EXISTS codes_request_message_idx ON codes (request_message_id) WHERE request_message_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS allowed_groups (
  group_id TEXT PRIMARY KEY,
  group_name TEXT NOT NULL,
  active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS allowed_groups_active_idx ON allowed_groups (active);

CREATE TABLE IF NOT EXISTS processed_messages (
  message_id TEXT PRIMARY KEY,
  group_id TEXT NOT NULL,
  processed_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS processed_messages_group_idx ON processed_messages (group_id, processed_at DESC);

CREATE TABLE IF NOT EXISTS audit_logs (
  id BIGSERIAL PRIMARY KEY,
  action TEXT NOT NULL,
  category TEXT,
  code_id BIGINT REFERENCES codes(id),
  group_id TEXT,
  requested_by TEXT,
  whatsapp_message_id TEXT,
  delivery_status TEXT CHECK (delivery_status IS NULL OR delivery_status IN ('pending', 'sent', 'failed')),
  error_message TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS audit_logs_filters_idx ON audit_logs (created_at DESC, category, group_id);

CREATE TABLE IF NOT EXISTS dashboard_sessions (
  sid VARCHAR PRIMARY KEY,
  sess JSON NOT NULL,
  expire TIMESTAMP(6) NOT NULL
);
CREATE INDEX IF NOT EXISTS dashboard_sessions_expire_idx ON dashboard_sessions (expire);
