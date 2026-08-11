'use strict';

const Decimal = require('decimal.js');

const NUMBER = '(?:\\d+(?:\\.\\d+)?|\\.\\d+)';
const ADJUSTMENT_PATTERN = new RegExp(`^([+-])(${NUMBER})$`);
const BINARY_PATTERN = new RegExp(`^(${NUMBER})\\s*([+*-])\\s*(${NUMBER})$`);

function parseCalculation(body) {
  if (typeof body !== 'string') return null;
  const text = body.trim();
  if (!text || text.length > 200) return null;

  const adjustment = text.match(ADJUSTMENT_PATTERN);
  if (adjustment) {
    const value = new Decimal(adjustment[2]);
    return {
      expression: text,
      amount: (adjustment[1] === '-' ? value.negated() : value).toDecimalPlaces(2).toFixed(2),
      type: 'adjustment'
    };
  }

  const binary = text.match(BINARY_PATTERN);
  if (binary) {
    const left = new Decimal(binary[1]);
    const right = new Decimal(binary[3]);
    const operations = {
      '+': { amount: left.plus(right), type: 'addition' },
      '-': { amount: left.minus(right), type: 'subtraction' },
      '*': { amount: left.times(right), type: 'multiplication' }
    };
    const calculation = operations[binary[2]];
    return {
      expression: text,
      amount: calculation.amount.toDecimalPlaces(2).toFixed(2),
      type: calculation.type
    };
  }

  return null;
}

module.exports = { parseCalculation };
