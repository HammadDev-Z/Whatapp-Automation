'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { parseCalculation } = require('../src/services/calculator');

const cases = [
  ['10+20-5', '25.00'],
  ['4*6-8', '16.00'],
  ['3-8+50', '45.00'],
  ['30/4+70', '77.50'],
  ['90.29/3', '30.10'],
  ['90.38\u00f75', '18.08'],
  ['2560+32+487-273', '2806.00'],
  ['2+3*4-10/5', '12.00'],
  ['4\u00d76+2', '26.00']
];

for (const [expression, expected] of cases) {
  test(`calculates ${expression}`, () => {
    const calculation = parseCalculation(expression);
    assert.ok(calculation);
    assert.equal(calculation.amount, expected);
    assert.equal(calculation.type, 'expression');
  });
}

test('ignores messages that contain text', () => {
  assert.equal(parseCalculation('please calculate 10+20'), null);
});

test('rejects division by zero', () => {
  assert.equal(parseCalculation('10/0+2'), null);
});
