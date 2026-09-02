'use strict';

class CalculationRepository {
  constructor(pool) { this.pool = pool; }

  async record({ groupId, messageId, sender, expression, amount, type, groupName = null }) {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      const duplicate = await client.query(
        'SELECT 1 FROM calculation_transactions WHERE message_id=$1',
        [messageId]
      );
      if (duplicate.rowCount) {
        await client.query('ROLLBACK');
        return { duplicate: true };
      }

      const group = await client.query(
        `INSERT INTO calculation_balances(group_id, current_total, group_name)
         VALUES($1, 0, $2)
         ON CONFLICT(group_id) DO UPDATE SET updated_at=NOW(),
           group_name=COALESCE(EXCLUDED.group_name, calculation_balances.group_name)
         RETURNING current_total`,
        [groupId, groupName || null]
      );
      const balanceBefore = group.rows[0].current_total;
      const updated = await client.query(
        `UPDATE calculation_balances
         SET current_total=current_total+$2::numeric, updated_at=NOW()
         WHERE group_id=$1
         RETURNING current_total`,
        [groupId, amount]
      );
      await client.query(
        `INSERT INTO calculation_transactions
         (group_id,message_id,sender,expression,calculation_type,amount,balance_before,balance_after)
         VALUES($1,$2,$3,$4,$5,$6,$7,$8)`,
        [groupId, messageId, sender, expression, type, amount, balanceBefore, updated.rows[0].current_total]
      );
      await client.query('COMMIT');
      return { duplicate: false, currentTotal: updated.rows[0].current_total };
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  async setGroupName(groupId, groupName) {
    const name = String(groupName || '').trim().slice(0, 100);
    if (!name) return;
    await this.pool.query(
      `INSERT INTO calculation_balances(group_id, current_total, group_name)
       VALUES($1, 0, $2)
       ON CONFLICT(group_id) DO UPDATE SET group_name=$2, updated_at=NOW()`,
      [groupId, name]
    );
  }

  async listBalances() {
    const result = await this.pool.query(
      `SELECT group_id, current_total, group_name
       FROM calculation_balances
       ORDER BY COALESCE(group_name, group_id)`
    );
    return result.rows;
  }
}

module.exports = { CalculationRepository };
