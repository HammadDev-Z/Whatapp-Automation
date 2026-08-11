'use strict';

const { activeLimitWindowStart } = require('./limit-window');

class GroupLimitRepository {
  constructor(pool) { this.pool = pool; }

  async getGroup(groupId) {
    const result = await this.pool.query(
      'SELECT group_id,group_name,active FROM allowed_groups WHERE group_id=$1',
      [groupId]
    );
    return result.rows[0] || null;
  }

  async getWindowStart(groupId, now = new Date()) {
    const result = await this.pool.query(
      'SELECT window_started_at FROM group_limit_windows WHERE group_id=$1',
      [groupId]
    );
    return activeLimitWindowStart(result.rows[0]?.window_started_at, now);
  }

  async resetWindow(groupId) {
    const result = await this.pool.query(
      `INSERT INTO group_limit_windows(group_id,window_started_at,updated_at)
       VALUES($1,NOW(),NOW())
       ON CONFLICT(group_id) DO UPDATE SET window_started_at=NOW(),updated_at=NOW()
       RETURNING window_started_at`,
      [groupId]
    );
    return result.rows[0]?.window_started_at || null;
  }

  async resetAllWindows(executor = this.pool) {
    return executor.query(
      `INSERT INTO group_limit_windows(group_id,window_started_at,updated_at)
       SELECT group_id,NOW(),NOW() FROM allowed_groups
       ON CONFLICT(group_id) DO UPDATE SET window_started_at=NOW(),updated_at=NOW()`
    );
  }

  async listForGroup(groupId) {
    const windowStart = await this.getWindowStart(groupId);
    return (await this.pool.query(
      `SELECT cc.category,cc.display_name,l.daily_limit,
        count(c.id)::int AS used_last_24h
       FROM code_categories cc
       LEFT JOIN group_category_limits l
        ON l.category=cc.category AND l.group_id=$1
       LEFT JOIN codes c
        ON c.category=cc.category
        AND c.used_by_group=$1
        AND c.status='used'
        AND c.used_at >= $2
       WHERE cc.active=TRUE
       GROUP BY cc.category,cc.display_name,l.daily_limit
       ORDER BY CASE cc.category
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
       END`,
      [groupId, windowStart]
    )).rows;
  }

  async save(groupId, limits) {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      const group = await client.query('SELECT 1 FROM allowed_groups WHERE group_id=$1 FOR UPDATE', [groupId]);
      if (!group.rowCount) throw new Error('Group not found');
      await client.query('DELETE FROM group_category_limits WHERE group_id=$1', [groupId]);
      for (const [category, dailyLimit] of Object.entries(limits)) {
        await client.query(
          `INSERT INTO group_category_limits(group_id,category,daily_limit)
           SELECT $1,category,$3 FROM code_categories
           WHERE category=$2 AND active=TRUE`,
          [groupId, category, dailyLimit]
        );
      }
      await client.query('COMMIT');
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }
}

module.exports = { GroupLimitRepository };
