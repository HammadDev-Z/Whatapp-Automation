ALTER TABLE calculation_balances
ADD COLUMN IF NOT EXISTS currency TEXT NOT NULL DEFAULT 'pkr';

ALTER TABLE calculation_balances
DROP CONSTRAINT IF EXISTS calculation_balances_currency_check;

ALTER TABLE calculation_balances
ADD CONSTRAINT calculation_balances_currency_check CHECK (currency IN ('pkr', 'usdt'));
