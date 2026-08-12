'use strict';

const Decimal = require('decimal.js');

const NUMBER = '(?:\\d+(?:\\.\\d+)?|\\.\\d+)';
const ADJUSTMENT_PATTERN = new RegExp(`^([+-])(${NUMBER})$`);
// Only calculation-only messages match. Unicode escapes avoid source-encoding
// problems while allowing both keyboard and phone calculator symbols.
const OPERATOR = '[+*/\\-\\u00d7\\u00f7]';
const EXPRESSION_PATTERN = new RegExp(`^${NUMBER}(?:\\s*${OPERATOR}\\s*${NUMBER})+$`);
const TOKEN_PATTERN = new RegExp(`${NUMBER}|${OPERATOR}`, 'g');

function evaluateExpression(text) {
  const tokens = text.match(TOKEN_PATTERN);
  const values = [new Decimal(tokens[0])];
  const operators = [];
  const precedence = { '+': 1, '-': 1, '*': 2, '\u00d7': 2, '/': 2, '\u00f7': 2 };

  function applyOperation() {
    const operator = operators.pop();
    const right = values.pop();
    const left = values.pop();
    if ((operator === '/' || operator === '\u00f7') && right.isZero()) return false;
    const operations = {
      '+': () => left.plus(right),
      '-': () => left.minus(right),
      '*': () => left.times(right),
      '\u00d7': () => left.times(right),
      '/': () => left.dividedBy(right),
      '\u00f7': () => left.dividedBy(right)
    };
    values.push(operations[operator]());
    return true;
  }

  for (let index = 1; index < tokens.length; index += 2) {
    const operator = tokens[index];
    while (operators.length && precedence[operators.at(-1)] >= precedence[operator]) {
      if (!applyOperation()) return null;
    }
    operators.push(operator);
    values.push(new Decimal(tokens[index + 1]));
  }
  while (operators.length) {
    if (!applyOperation()) return null;
  }
  return values[0];
}

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

  if (EXPRESSION_PATTERN.test(text)) {
    const amount = evaluateExpression(text);
    if (!amount || !amount.isFinite()) return null;
    return {
      expression: text,
      amount: amount.toDecimalPlaces(2).toFixed(2),
      type: 'expression'
    };
  }

  return null;
}

module.exports = { parseCalculation };
