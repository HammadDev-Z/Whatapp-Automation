'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { UsageReportingService } = require('../src/services/usage-reporting');

test('reset stores and returns a new reporting baseline', async () => {
  const resetAt = new Date('2026-08-11T12:00:00Z');
  const calls = [];
  const service = new UsageReportingService({
    query: async (sql, values) => {
      calls.push({ sql, values });
      return { rows: [{ reset_at: resetAt }] };
    }
  });
  assert.equal(await service.reset(), resetAt);
  assert.match(calls[0].sql, /ON CONFLICT\(id\) DO UPDATE/);
});

test('group usage is scoped to one group and the reset baseline', async () => {
  const calls = [];
  const service = new UsageReportingService({
    query: async (sql, values) => {
      calls.push({ sql, values });
      return { rows: [{ category: '830', display_name: '830', used: 3 }] };
    }
  });
  const rows = await service.groupUsage('group@g.us');
  assert.equal(rows[0].used, 3);
  assert.deepEqual(calls[0].values, ['group@g.us']);
  assert.match(calls[0].sql, /used_at >= \(SELECT reset_at/);
});

test('inventory reports used codes only since reset', async () => {
  let sql = '';
  const service = new UsageReportingService({
    query: async (query) => { sql = query; return { rows: [] }; }
  });
  await service.inventory();
  assert.match(sql, /FILTER \(\s*WHERE c\.status='used'/);
  assert.match(sql, /usage_reporting_state/);
});
