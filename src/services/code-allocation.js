'use strict';

class CodeAllocationService {
  constructor(pool) { this.pool = pool; }

  async allocate({ category, groupId, requestedBy, messageId }) {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      const group = await client.query('SELECT active FROM allowed_groups WHERE group_id=$1 FOR SHARE', [groupId]);
      if (!group.rowCount || !group.rows[0].active) {
        await client.query('ROLLBACK');
        return { status: 'unauthorized' };
      }

      const seen = await client.query(
        'INSERT INTO processed_messages(message_id, group_id) VALUES($1,$2) ON CONFLICT DO NOTHING RETURNING message_id',
        [messageId, groupId]
      );
      if (!seen.rowCount) {
        await client.query('ROLLBACK');
        return { status: 'duplicate' };
      }

      const selected = await client.query(
        `SELECT id, code FROM codes
         WHERE category=$1 AND status='unused'
         ORDER BY id
         FOR UPDATE SKIP LOCKED LIMIT 1`,
        [category]
      );
      if (!selected.rowCount) {
        await client.query(
          `INSERT INTO audit_logs(action,category,group_id,requested_by,whatsapp_message_id)
           VALUES('out_of_stock',$1,$2,$3,$4)`,
          [category, groupId, requestedBy, messageId]
        );
        await client.query('COMMIT');
        return { status: 'out_of_stock' };
      }

      const item = selected.rows[0];
      await client.query(
        `UPDATE codes SET status='used', used_by_group=$1, requested_by=$2,
         request_message_id=$3, used_at=NOW(), delivery_status='pending' WHERE id=$4`,
        [groupId, requestedBy, messageId, item.id]
      );
      await client.query(
        `INSERT INTO audit_logs(action,category,code_id,group_id,requested_by,whatsapp_message_id,delivery_status)
         VALUES('allocated',$1,$2,$3,$4,$5,'pending')`,
        [category, item.id, groupId, requestedBy, messageId]
      );
      await client.query('COMMIT');
      return { status: 'allocated', codeId: item.id, code: item.code };
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally { client.release(); }
  }

  async recordDelivery({ codeId, category, groupId, requestedBy, messageId, success, error }) {
    const status = success ? 'sent' : 'failed';
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      await client.query('UPDATE codes SET delivery_status=$1 WHERE id=$2', [status, codeId]);
      await client.query(
        `INSERT INTO audit_logs(action,category,code_id,group_id,requested_by,whatsapp_message_id,delivery_status,error_message)
         VALUES($1,$2,$3,$4,$5,$6,$7,$8)`,
        [success ? 'delivered' : 'delivery_failed', category, codeId, groupId, requestedBy, messageId, status,
          error ? String(error.message || error).slice(0, 1000) : null]
      );
      await client.query('COMMIT');
    } catch (recordError) { await client.query('ROLLBACK'); throw recordError; } finally { client.release(); }
  }
}

module.exports = { CodeAllocationService };
