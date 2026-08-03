'use strict';

const { normalizePhone } = require('../utilities/normalization');

class AdminRepository {
  constructor(pool) {
    this.pool = pool;
  }

  async list() {
    const result = await this.pool.query('SELECT phone, display_name, created_at, updated_at FROM admin_numbers ORDER BY created_at DESC');
    return result.rows.map((row) => ({
      phone: normalizePhone(row.phone),
      display_name: row.display_name || '',
      created_at: row.created_at,
      updated_at: row.updated_at
    }));
  }

  async set(phone, displayName) {
    const normalized = normalizePhone(phone);
    if (!normalized) throw new Error('Invalid phone number');
    await this.pool.query(
      `INSERT INTO admin_numbers(phone,display_name,created_at,updated_at)
       VALUES($1,$2,NOW(),NOW())
       ON CONFLICT(phone) DO UPDATE SET display_name=EXCLUDED.display_name,updated_at=NOW()`,
      [normalized, displayName || null]
    );
  }

  async delete(phone) {
    const normalized = normalizePhone(phone);
    if (!normalized) return;
    await this.pool.query('DELETE FROM admin_numbers WHERE phone=$1', [normalized]);
  }

  async isAllowed(candidate) {
    const normalized = normalizePhone(candidate);
    if (!normalized) return false;
    const result = await this.pool.query('SELECT 1 FROM admin_numbers WHERE phone=$1 LIMIT 1', [normalized]);
    return result.rowCount > 0;
  }

  async seedFromCsv(csv) {
    const phones = String(csv || '').split(',').map(normalizePhone).filter(Boolean);
    if (!phones.length) return;
    await this.pool.query('BEGIN');
    try {
      for (const phone of phones) {
        await this.pool.query(
          `INSERT INTO admin_numbers(phone,display_name,created_at,updated_at)
           VALUES($1,NULL,NOW(),NOW())
           ON CONFLICT(phone) DO NOTHING`,
          [phone]
        );
      }
      await this.pool.query('COMMIT');
    } catch (error) {
      await this.pool.query('ROLLBACK');
      throw error;
    }
  }
}

module.exports = { AdminRepository };