'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const express = require('express');
const { createStockApiRouter } = require('../src/routes/stock-api');

const KEY = 'k'.repeat(40);

// Just enough of a pg pool for importCodeLines: aliases, a unique `code`, audit rows.
function fakePool() {
  const stored = new Map(); // code -> category
  const audit = [];
  const aliases = { '830': '830', '2320': '2320', '5k': '5150', '5150': '5150', '13k': '13k' };
  const client = {
    async query(sql, params = []) {
      if (/^(BEGIN|COMMIT|ROLLBACK)/.test(sql.trim())) return { rowCount: 0, rows: [] };
      if (/FROM category_aliases/.test(sql)) {
        const category = aliases[params[0]];
        return category ? { rowCount: 1, rows: [{ category }] } : { rowCount: 0, rows: [] };
      }
      if (/INSERT INTO codes/.test(sql)) {
        const [category, code] = params;
        if (stored.has(code)) return { rowCount: 0, rows: [] };
        stored.set(code, category);
        return { rowCount: 1, rows: [{ id: stored.size }] };
      }
      if (/INSERT INTO audit_logs/.test(sql)) { audit.push(params); return { rowCount: 1, rows: [] }; }
      throw new Error(`unexpected query: ${sql}`);
    },
    release() {}
  };
  return { connect: async () => client, stored, audit };
}

async function withServer(config, fn) {
  const pool = fakePool();
  const app = express();
  app.use(createStockApiRouter({ pool, config }));
  const server = http.createServer(app);
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  const post = (body, headers = {}) => fetch(`${base}/api/stock/import`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...headers },
    body: typeof body === 'string' ? body : JSON.stringify(body)
  });
  try { await fn({ post, pool }); } finally { server.close(); }
}

const auth = { authorization: `Bearer ${KEY}` };

test('import adds codes under the resolved category, skips repeats, audits each', async () => {
  await withServer({ stockApiKey: KEY }, async ({ post, pool }) => {
    let res = await post({ category: '5k', codes: ['AAA111', 'BBB222'] }, auth);
    assert.equal(res.status, 200);
    assert.deepEqual(await res.json(), { category: '5150', imported: 2, skipped: 0, failed: 0 });

    res = await post({ category: '5k', codes: ['BBB222', 'CCC333'] }, auth); // BBB222 is a repeat
    assert.deepEqual(await res.json(), { category: '5150', imported: 1, skipped: 1, failed: 0 });

    assert.equal(pool.stored.size, 3);
    assert.equal(pool.audit.length, 3);
    assert.ok([...pool.stored.values()].every((category) => category === '5150'));
  });
});

test('requests without the right key are refused and import nothing', async () => {
  await withServer({ stockApiKey: KEY }, async ({ post, pool }) => {
    const body = { category: '830', codes: ['X1'] };
    assert.equal((await post(body)).status, 401);
    assert.equal((await post(body, { authorization: 'Bearer wrong' })).status, 401);
    assert.equal((await post(body, { authorization: KEY })).status, 401); // no "Bearer"
    assert.equal(pool.stored.size, 0);
  });
});

test('the endpoint does not exist until STOCK_API_KEY is configured', async () => {
  await withServer({ stockApiKey: '' }, async ({ post, pool }) => {
    assert.equal((await post({ category: '830', codes: ['X1'] }, auth)).status, 404);
    assert.equal(pool.stored.size, 0);
  });
});

test('bad input is a 400', async () => {
  await withServer({ stockApiKey: KEY }, async ({ post }) => {
    assert.equal((await post({ category: '830', codes: [] }, auth)).status, 400);
    assert.equal((await post({ category: '830', codes: [1, 2] }, auth)).status, 400);
    assert.equal((await post({ codes: ['A'] }, auth)).status, 400);
    assert.equal((await post('{not json', auth)).status, 400);
    const unknown = await post({ category: 'nope', codes: ['A1'] }, auth);
    assert.equal(unknown.status, 400);
    const tooMany = await post({ category: '830', codes: Array.from({ length: 1001 }, (_, i) => `C${i}`) }, auth);
    assert.equal(tooMany.status, 400);
  });
});
