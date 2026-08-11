'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { parseCommand } = require('../src/utilities/commands');
const { normalizeCategory } = require('../src/utilities/normalization');

test('accepts dollar and decimal category aliases', () => {
  for (const category of ['2$', '68k', '5$', '224k', '10$', '1.4m']) {
    assert.equal(normalizeCategory(category), category);
    assert.deepEqual(parseCommand(`/tag ${category}`), { name: 'tag', category, quantity: 1 });
    assert.deepEqual(parseCommand(`/stock ${category}`), { name: 'stock', category });
  }
});

test('accepts quantity shorthand for the new categories', () => {
  assert.deepEqual(parseCommand('2$x5'), { name: 'tag', category: '2$', quantity: 5 });
  assert.deepEqual(parseCommand('224kx3'), { name: 'tag', category: '224k', quantity: 3 });
  assert.deepEqual(parseCommand('1.4m x 2'), { name: 'tag', category: '1.4m', quantity: 2 });
});
