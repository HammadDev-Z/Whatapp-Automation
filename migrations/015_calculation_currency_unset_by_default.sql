-- Every existing row got 'pkr' only because migration 014's ADD COLUMN ... DEFAULT
-- 'pkr' back-filled it, not because anyone ran /pkr or /usdt. Reset everything to
-- unset so broadcasts only reach groups an admin has actually labeled. The CHECK
-- constraint from migration 014 already tolerates NULL (a CHECK is only violated by
-- an expression that evaluates to FALSE, and `currency IN (...)` on NULL is NULL, not
-- FALSE), so it needs no change.
ALTER TABLE calculation_balances ALTER COLUMN currency DROP NOT NULL;
ALTER TABLE calculation_balances ALTER COLUMN currency DROP DEFAULT;
UPDATE calculation_balances SET currency = NULL;
