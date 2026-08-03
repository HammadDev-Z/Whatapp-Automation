INSERT INTO audit_logs(action,category,code_id,delivery_status,created_at)
SELECT 'code_imported',c.category,c.id,NULL,c.created_at
FROM codes c
WHERE NOT EXISTS (
  SELECT 1 FROM audit_logs a
  WHERE a.code_id=c.id AND a.action='code_imported'
);

INSERT INTO audit_logs(action,group_id,created_at)
SELECT 'group_registered',g.group_id,g.created_at
FROM allowed_groups g
WHERE NOT EXISTS (
  SELECT 1 FROM audit_logs a
  WHERE a.group_id=g.group_id AND a.action='group_registered'
);

CREATE INDEX IF NOT EXISTS audit_logs_code_idx ON audit_logs(code_id,created_at DESC)
WHERE code_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS audit_logs_action_idx ON audit_logs(action,created_at DESC);
