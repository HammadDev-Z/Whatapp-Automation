'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { GroupLimitRepository } = require('../src/services/group-limit-repository');

test('saves only configured category limits in one transaction', async () => {
  const calls = [];
  const client = {
    query: async (sql, values) => {
      calls.push({ sql, values });
      if (sql.includes('SELECT 1 FROM allowed_groups')) return { rowCount: 1, rows: [{}] };
      return { rowCount: 1, rows: [] };
    },
    release() {}
  };
  const repository = new GroupLimitRepository({ connect: async () => client });

  await repository.save('group@g.us', { '830': 5, '13k': 2 });

  assert.equal(calls[0].sql, 'BEGIN');
  assert.ok(calls.some((call) => call.sql.includes('DELETE FROM group_category_limits')));
  const inserts = calls.filter((call) => call.sql.includes('INSERT INTO group_category_limits'));
  assert.deepEqual(inserts.map((call) => call.values), [
    ['group@g.us', '830', 5],
    ['group@g.us', '13k', 2]
  ]);
  assert.equal(calls.at(-1).sql, 'COMMIT');
});

test('lists limits in the inventory category order', async () => {
  let query = '';
  const repository = new GroupLimitRepository({
    query: async (sql) => { query = sql; return { rows: [] }; }
  });

  await repository.listForGroup('group@g.us');

  assert.match(query, /WHEN '830' THEN 1/);
  assert.match(query, /WHEN '2320' THEN 2/);
  assert.match(query, /WHEN '1\.4m' THEN 9/);
});

test('resets the limit window for every group', async () => {
  let query = '';
  const repository = new GroupLimitRepository({
    query: async (sql) => { query = sql; return { rowCount: 3, rows: [] }; }
  });

  await repository.resetAllWindows();

  assert.match(query, /SELECT group_id,NOW\(\),NOW\(\) FROM allowed_groups/);
  assert.match(query, /ON CONFLICT\(group_id\) DO UPDATE/);
});
