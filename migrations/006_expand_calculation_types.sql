ALTER TABLE calculation_transactions
DROP CONSTRAINT IF EXISTS calculation_transactions_calculation_type_check;

ALTER TABLE calculation_transactions
ADD CONSTRAINT calculation_transactions_calculation_type_check
CHECK (calculation_type IN ('adjustment', 'addition', 'subtraction', 'multiplication'));
