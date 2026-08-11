'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { parseCalculation } = require('../src/services/calculator');

test('accepts signed numbers and strict binary calculations', () => {
  assert.deepEqual(parseCalculation('+54'), { expression: '+54', amount: '54.00', type: 'adjustment' });
  assert.deepEqual(parseCalculation('-94'), { expression: '-94', amount: '-94.00', type: 'adjustment' });
  assert.deepEqual(parseCalculation('49*32'), { expression: '49*32', amount: '1568.00', type: 'multiplication' });
  assert.deepEqual(parseCalculation('89-54'), { expression: '89-54', amount: '35.00', type: 'subtraction' });
  assert.deepEqual(parseCalculation('10+5'), { expression: '10+5', amount: '15.00', type: 'addition' });
  assert.deepEqual(parseCalculation('49 * 32'), { expression: '49 * 32', amount: '1568.00', type: 'multiplication' });
  assert.deepEqual(parseCalculation('+0.8'), { expression: '+0.8', amount: '0.80', type: 'adjustment' });
  assert.deepEqual(parseCalculation('-0.8'), { expression: '-0.8', amount: '-0.80', type: 'adjustment' });
  assert.deepEqual(parseCalculation('45.8*4'), { expression: '45.8*4', amount: '183.20', type: 'multiplication' });
});

test('uses exact decimal multiplication', () => {
  assert.equal(parseCalculation('0.1*0.2').amount, '0.02');
});

test('ignores plain numbers and all mixed messages', () => {
  for (const message of ['54', 'this ok', 'Bas 628 done kr do', '8/2', '+54 ok', '49 * 32 ok', '++54', '10++5', '']) {
    assert.equal(parseCalculation(message), null, message);
  }
});
