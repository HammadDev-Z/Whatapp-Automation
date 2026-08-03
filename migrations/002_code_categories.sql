CREATE TABLE IF NOT EXISTS code_categories (
  category TEXT PRIMARY KEY CHECK (category = lower(category) AND category ~ '^[a-z0-9_-]+$'),
  display_name TEXT NOT NULL,
  active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS category_aliases (
  alias TEXT PRIMARY KEY CHECK (alias = lower(alias) AND alias ~ '^[a-z0-9_-]+$'),
  category TEXT NOT NULL REFERENCES code_categories(category) ON UPDATE CASCADE ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

INSERT INTO code_categories(category, display_name, active) VALUES
  ('830', '830', TRUE),
  ('2320', '2320', TRUE),
  ('5150', '5150', TRUE),
  ('13k', '13k', TRUE),
  ('27k', '27k', TRUE),
  ('56k', '56k', TRUE)
ON CONFLICT(category) DO UPDATE
SET display_name=EXCLUDED.display_name, active=TRUE, updated_at=NOW();

INSERT INTO category_aliases(alias, category) VALUES
  ('830', '830'),
  ('2320', '2320'),
  ('5150', '5150'),
  ('5k', '5150'),
  ('13k', '13k'),
  ('27k', '27k'),
  ('56k', '56k')
ON CONFLICT(alias) DO UPDATE SET category=EXCLUDED.category;

UPDATE codes SET category='5150' WHERE category='5k';
UPDATE audit_logs SET category='5150' WHERE category='5k';

CREATE INDEX IF NOT EXISTS category_aliases_category_idx ON category_aliases(category);
CREATE INDEX IF NOT EXISTS code_categories_active_idx ON code_categories(active);
