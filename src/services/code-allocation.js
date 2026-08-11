'use strict';

const { activeLimitWindowStart, latestPakistanNoon } = require('./limit-window');

class CodeAllocationService {
  constructor(pool, { now = () => new Date() } = {}) { this.pool = pool; this.now = now; }

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

      const configuredLimit = await client.query(
        `SELECT daily_limit FROM group_category_limits
         WHERE group_id=$1 AND category=$2 FOR UPDATE`,
        [groupId, category]
      );
      let effectiveQuantity = quantity;
      let remainingLimit = null;
      let dailyLimit = null;
      if (configuredLimit.rowCount) {
        dailyLimit = Number(configuredLimit.rows[0].daily_limit);
        const now = this.now();
        await client.query(
          `INSERT INTO group_limit_windows(group_id,window_started_at)
           VALUES($1,$2) ON CONFLICT(group_id) DO NOTHING`,
          [groupId, latestPakistanNoon(now)]
        );
        const window = await client.query(
          'SELECT window_started_at FROM group_limit_windows WHERE group_id=$1 FOR UPDATE',
          [groupId]
        );
        const windowStart = activeLimitWindowStart(window.rows[0]?.window_started_at, now);
        const usage = await client.query(
          `SELECT count(*)::int AS count FROM codes
           WHERE used_by_group=$1 AND category=$2 AND status='used'
           AND used_at >= $3`,
          [groupId, category, windowStart]
        );
        remainingLimit = Math.max(0, dailyLimit - Number(usage.rows[0].count));
        if (remainingLimit === 0) {
          await client.query(
            `INSERT INTO audit_logs(action,category,group_id,requested_by,whatsapp_message_id,error_message)
             VALUES('limit_reached',$1,$2,$3,$4,$5)`,
            [category, groupId, requestedBy, messageId, `daily_limit=${dailyLimit}`]
          );
          await client.query('COMMIT');
          return { status: 'limit_reached', dailyLimit, remainingLimit: 0 };
        }
        effectiveQuantity = Math.min(quantity, remainingLimit);
      }

      const selected = await client.query(
        `SELECT id, code FROM codes
         WHERE category=$1 AND status='unused'
         ORDER BY id
         FOR UPDATE SKIP LOCKED LIMIT $2`,
        [category, effectiveQuantity]
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
      const limitReached = remainingLimit !== null && items.length === remainingLimit && remainingLimit <= quantity;
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
        limitReached,
        dailyLimit,
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
