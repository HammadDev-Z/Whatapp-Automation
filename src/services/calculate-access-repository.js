'use strict';

class CalculateAccessRepository {
  constructor(pool) { this.pool = pool; }
  async isAllowed(groupId) {
    const result = await this.pool.query('SELECT active FROM calculate_access_groups WHERE group_id=$1', [groupId]);
    return Boolean(result.rowCount && result.rows[0].active);
  }
  async set(groupId, groupName, active = true) {
    await this.pool.query(
      `INSERT INTO calculate_access_groups(group_id,group_name,active) VALUES($1,$2,$3)
       ON CONFLICT(group_id) DO UPDATE SET group_name=EXCLUDED.group_name,active=EXCLUDED.active,updated_at=NOW()`,
      [groupId, groupName, active]
    );
  }
  async toggle(groupId, active) {
    return this.pool.query('UPDATE calculate_access_groups SET active=$2,updated_at=NOW() WHERE group_id=$1', [groupId, active]);
  }
  async list() { return (await this.pool.query('SELECT * FROM calculate_access_groups ORDER BY group_name')).rows; }
}

module.exports = { CalculateAccessRepository };
