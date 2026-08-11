ALTER TABLE codes DROP CONSTRAINT IF EXISTS codes_category_check;
ALTER TABLE codes ADD CONSTRAINT codes_category_check
CHECK (category = lower(category) AND category ~ '^[a-z0-9_.$-]+$');

ALTER TABLE code_categories DROP CONSTRAINT IF EXISTS code_categories_category_check;
ALTER TABLE code_categories ADD CONSTRAINT code_categories_category_check
CHECK (category = lower(category) AND category ~ '^[a-z0-9_.$-]+$');

ALTER TABLE category_aliases DROP CONSTRAINT IF EXISTS category_aliases_alias_check;
ALTER TABLE category_aliases ADD CONSTRAINT category_aliases_alias_check
CHECK (alias = lower(alias) AND alias ~ '^[a-z0-9_.$-]+$');

INSERT INTO code_categories(category, display_name, active) VALUES
  ('68k', '2$ / 68k', TRUE),
  ('224k', '5$ / 224k', TRUE),
  ('1.4m', '10$ / 1.4m', TRUE)
ON CONFLICT(category) DO UPDATE
SET display_name=EXCLUDED.display_name, active=TRUE, updated_at=NOW();

INSERT INTO category_aliases(alias, category) VALUES
  ('2$', '68k'), ('68k', '68k'),
  ('5$', '224k'), ('224k', '224k'),
  ('10$', '1.4m'), ('1.4m', '1.4m')
ON CONFLICT(alias) DO UPDATE SET category=EXCLUDED.category;
