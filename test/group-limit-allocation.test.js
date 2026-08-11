'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { CodeAllocationService } = require('../src/services/code-allocation');

function allocationService({ used, codes }) {
  const calls = [];
  const client = {
    query: async (sql, values) => {
      calls.push({ sql, values });
      if (sql.includes('SELECT active FROM allowed_groups')) return { rowCount: 1, rows: [{ active: true }] };
      if (sql.includes('INSERT INTO processed_messages')) return { rowCount: 1, rows: [{ message_id: 'message-1' }] };
      if (sql.includes('SELECT daily_limit FROM group_category_limits')) return { rowCount: 1, rows: [{ daily_limit: 5 }] };
      if (sql.includes('SELECT window_started_at FROM group_limit_windows')) return { rowCount: 1, rows: [{ window_started_at: new Date('2026-08-12T07:00:00Z') }] };
      if (sql.includes("SELECT count(*)::int AS count FROM codes")) return { rowCount: 1, rows: [{ count: used }] };
      if (sql.includes('SELECT id, code FROM codes')) return { rowCount: codes.length, rows: codes };
      return { rowCount: 1, rows: [] };
    },
    release() {}
  };
  return { service: new CodeAllocationService({ connect: async () => client }), calls };
}

test('issues only the remaining group allowance', async () => {
  const codes = Array.from({ length: 5 }, (_, index) => ({ id: index + 1, code: `CODE-${index + 1}` }));
  const { service, calls } = allocationService({ used: 0, codes });

  const result = await service.allocate({
    category: '830',
    groupId: 'group@g.us',
    requestedBy: 'user@c.us',
    messageId: 'message-1',
    quantity: 10
  });

  assert.equal(result.status, 'allocated');
  assert.equal(result.issuedQuantity, 5);
  assert.equal(result.requestedQuantity, 10);
  assert.equal(result.dailyLimit, 5);
  assert.equal(result.limitReached, true);
  const selection = calls.find((call) => call.sql.includes('SELECT id, code FROM codes'));
  assert.deepEqual(selection.values, ['830', 5]);
});

test('returns stock ended when the 24-hour allowance is exhausted', async () => {
  const { service, calls } = allocationService({ used: 5, codes: [] });

  const result = await service.allocate({
    category: '830',
    groupId: 'group@g.us',
    requestedBy: 'user@c.us',
    messageId: 'message-1',
    quantity: 1
  });

  assert.deepEqual(result, { status: 'limit_reached', dailyLimit: 5, remainingLimit: 0 });
  assert.equal(calls.some((call) => call.sql.includes('SELECT id, code FROM codes')), false);
});
