CREATE TABLE IF NOT EXISTS calculation_balances (
  group_id TEXT PRIMARY KEY,
  current_total NUMERIC(20, 2) NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS calculation_transactions (
  id BIGSERIAL PRIMARY KEY,
  group_id TEXT NOT NULL REFERENCES calculation_balances(group_id) ON DELETE CASCADE,
  message_id TEXT NOT NULL UNIQUE,
  sender TEXT NOT NULL,
  expression TEXT NOT NULL,
  calculation_type TEXT NOT NULL CHECK (calculation_type IN ('adjustment', 'addition', 'subtraction', 'multiplication')),
  amount NUMERIC(20, 2) NOT NULL,
  balance_before NUMERIC(20, 2) NOT NULL,
  balance_after NUMERIC(20, 2) NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS calculation_transactions_group_created_idx
ON calculation_transactions(group_id, created_at DESC);
