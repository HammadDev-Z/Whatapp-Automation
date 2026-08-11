'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { LOW_STOCK_THRESHOLDS, StockMonitor } = require('../src/services/stock-monitor');

function monitorWithCount(count) {
  return new StockMonitor({
    query: async () => ({ rows: [{ count }] })
  });
}

test('defines the requested category thresholds', () => {
  assert.deepEqual(LOW_STOCK_THRESHOLDS, {
    '830': 10,
    '2320': 10,
    '5150': 10,
    '13k': 4,
    '27k': 2,
    '56k': 2
  });
});

test('alerts only when remaining stock is strictly below the threshold', async () => {
  assert.deepEqual(await monitorWithCount(9).check('830'), { category: '830', remaining: 9, threshold: 10 });
  assert.equal(await monitorWithCount(10).check('830'), null);
  assert.deepEqual(await monitorWithCount(3).check('13k'), { category: '13k', remaining: 3, threshold: 4 });
  assert.equal(await monitorWithCount(2).check('27k'), null);
  assert.deepEqual(await monitorWithCount(1).check('56k'), { category: '56k', remaining: 1, threshold: 2 });
});

test('ignores categories without a configured threshold', async () => {
  let queried = false;
  const monitor = new StockMonitor({ query: async () => { queried = true; } });
  assert.equal(await monitor.check('unknown'), null);
  assert.equal(queried, false);
});
