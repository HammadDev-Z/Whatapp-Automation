'use strict';

class CodeAllocationService {
  constructor(pool) { this.pool = pool; }

  async allocate({ category, groupId, requestedBy, messageId, quantity = 1 }) {
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
         FOR UPDATE SKIP LOCKED LIMIT $2`,
        [category, quantity]
      );
      if (!selected.rowCount) {
        await client.query(
          `INSERT INTO audit_logs(action,category,group_id,requested_by,whatsapp_message_id,error_message)
           VALUES('out_of_stock',$1,$2,$3,$4,$5)`,
          [category, groupId, requestedBy, messageId, `requested=${quantity}; available=0`]
        );
        await client.query('COMMIT');
        return { status: 'out_of_stock', requestedQuantity: quantity, availableQuantity: 0 };
      }

      const items = selected.rows;
      const ids = items.map((item) => item.id);
      const partial = items.length < quantity;
      await client.query(
        `UPDATE codes SET status='used', used_by_group=$1, requested_by=$2,
         request_message_id=$3, used_at=NOW(), delivery_status='pending'
         WHERE id=ANY($4::bigint[])`,
        [groupId, requestedBy, messageId, ids]
      );
      await client.query(
        `INSERT INTO audit_logs(action,category,code_id,group_id,requested_by,whatsapp_message_id,delivery_status)
         SELECT 'allocated',$1,id,$3,$4,$5,'pending' FROM unnest($2::bigint[]) AS id`,
        [category, ids, groupId, requestedBy, messageId]
      );
      if (partial) {
        await client.query(
          `INSERT INTO audit_logs(action,category,group_id,requested_by,whatsapp_message_id,delivery_status,error_message)
           VALUES('partial_allocation',$1,$2,$3,$4,'pending',$5)`,
          [category, groupId, requestedBy, messageId, `requested=${quantity}; issued=${items.length}`]
        );
      }
      await client.query('COMMIT');
      return {
        status: 'allocated',
        partial,
        requestedQuantity: quantity,
        issuedQuantity: items.length,
        codes: items.map((item) => ({ codeId: item.id, code: item.code })),
        codeId: items[0].id,
        code: items[0].code
      };
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally { client.release(); }
  }

  async recordDelivery({ codeId, codeIds, category, groupId, requestedBy, messageId, success, error }) {
    const status = success ? 'sent' : 'failed';
    const ids = codeIds || [codeId];
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      await client.query('UPDATE codes SET delivery_status=$1 WHERE id=ANY($2::bigint[])', [status, ids]);
      await client.query(
        `INSERT INTO audit_logs(action,category,code_id,group_id,requested_by,whatsapp_message_id,delivery_status,error_message)
         SELECT $1,$2,id,$4,$5,$6,$7,$8 FROM unnest($3::bigint[]) AS id`,
        [success ? 'delivered' : 'delivery_failed', category, ids, groupId, requestedBy, messageId, status,
          error ? String(error.message || error).slice(0, 1000) : null]
      );
      await client.query('COMMIT');
    } catch (recordError) { await client.query('ROLLBACK'); throw recordError; } finally { client.release(); }
  }
}

module.exports = { CodeAllocationService };
