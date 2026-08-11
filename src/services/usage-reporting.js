'use strict';

const CATEGORY_ORDER = `
  CASE cc.category
    WHEN '830' THEN 1
    WHEN '2320' THEN 2
    WHEN '5150' THEN 3
    WHEN '13k' THEN 4
    WHEN '27k' THEN 5
    WHEN '56k' THEN 6
    WHEN '68k' THEN 7
    WHEN '224k' THEN 8
    WHEN '1.4m' THEN 9
    ELSE 999
  END`;

class UsageReportingService {
  constructor(pool) { this.pool = pool; }

  async getResetAt() {
    const result = await this.pool.query('SELECT reset_at FROM usage_reporting_state WHERE id=1');
    return result.rows[0]?.reset_at || new Date(0);
  }

  async reset() {
    const result = await this.pool.query(
      `INSERT INTO usage_reporting_state(id,reset_at,updated_at)
       VALUES(1,NOW(),NOW())
       ON CONFLICT(id) DO UPDATE SET reset_at=NOW(),updated_at=NOW()
       RETURNING reset_at`
    );
    return result.rows[0].reset_at;
  }

  async inventory() {
    return (await this.pool.query(
      `SELECT cc.category,cc.display_name,
        count(c.id) FILTER (WHERE c.status='unused')::int unused,
        count(c.id) FILTER (
          WHERE c.status='used'
          AND c.used_at >= (SELECT reset_at FROM usage_reporting_state WHERE id=1)
        )::int used,
        count(c.id) FILTER (WHERE c.delivery_status='failed')::int failed
       FROM code_categories cc
       LEFT JOIN codes c ON c.category=cc.category
       WHERE cc.active=TRUE
       GROUP BY cc.category,cc.display_name
       ORDER BY ${CATEGORY_ORDER}`
    )).rows;
  }

  async listGroups() {
    return (await this.pool.query(
      'SELECT group_id,group_name,active FROM allowed_groups ORDER BY group_name,group_id'
    )).rows;
  }

  async groupUsage(groupId) {
    return (await this.pool.query(
      `SELECT cc.category,cc.display_name,count(c.id)::int AS used
       FROM code_categories cc
       LEFT JOIN codes c ON c.category=cc.category
        AND c.status='used'
        AND c.used_by_group=$1
        AND c.used_at >= (SELECT reset_at FROM usage_reporting_state WHERE id=1)
       WHERE cc.active=TRUE
       GROUP BY cc.category,cc.display_name
       ORDER BY ${CATEGORY_ORDER}`,
      [groupId]
    )).rows;
  }
}

module.exports = { UsageReportingService };
