'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs/promises');
const path = require('node:path');
const { createPool } = require('../src/database/pool');
const { CodeAllocationService } = require('../src/services/code-allocation');

const enabled = process.env.RUN_DB_TESTS === '1';

test('simultaneous allocations receive distinct codes and duplicates allocate once', { skip: !enabled }, async () => {
  const pool = createPool(process.env.TEST_DATABASE_URL || process.env.DATABASE_URL || 'postgresql://postgres:postgres@localhost:5432/whatsapp_codes');
  const token = crypto.randomUUID().replaceAll('-', '');
  const category = `test_${token}`;
  const groups = [`g1-${token}@g.us`, `g2-${token}@g.us`];
  const messages = [`m1-${token}`, `m2-${token}`];

  try {
    await pool.query(await fs.readFile(path.join(__dirname, '..', 'migrations', '001_initial.sql'), 'utf8'));
    await pool.query(
      'INSERT INTO allowed_groups(group_id,group_name) VALUES($1,$2),($3,$4)',
      [groups[0], 'Integration One', groups[1], 'Integration Two']
    );
    await pool.query(
      'INSERT INTO codes(category,code) VALUES($1,$2),($1,$3)',
      [category, `INTEGRATION-A-${token}`, `INTEGRATION-B-${token}`]
    );

    const service = new CodeAllocationService(pool);
    const [first, second] = await Promise.all([
      service.allocate({ category, groupId: groups[0], requestedBy: 'a', messageId: messages[0] }),
      service.allocate({ category, groupId: groups[1], requestedBy: 'b', messageId: messages[1] })
    ]);

    assert.equal(first.status, 'allocated');
    assert.equal(second.status, 'allocated');
    assert.notEqual(first.code, second.code);

    const duplicate = await service.allocate({ category, groupId: groups[0], requestedBy: 'a', messageId: messages[0] });
    assert.equal(duplicate.status, 'duplicate');
    const used = await pool.query("SELECT count(*)::int AS count FROM codes WHERE category=$1 AND status='used'", [category]);
    assert.equal(used.rows[0].count, 2);
  } finally {
    await pool.query('DELETE FROM audit_logs WHERE category=$1', [category]).catch(() => {});
    await pool.query('DELETE FROM processed_messages WHERE message_id=ANY($1)', [messages]).catch(() => {});
    await pool.query('DELETE FROM codes WHERE category=$1', [category]).catch(() => {});
    await pool.query('DELETE FROM allowed_groups WHERE group_id=ANY($1)', [groups]).catch(() => {});
    await pool.end();
  }
});
