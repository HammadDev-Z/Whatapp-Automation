'use strict';

const Decimal = require('decimal.js');

const NUMBER = '(?:\\d+(?:\\.\\d+)?|\\.\\d+)';
const ADJUSTMENT_PATTERN = new RegExp(`^([+-])(${NUMBER})$`);
// Multiplication deliberately accepts only `*`; plain `x` may be part of the
// bot's inventory shorthand and must never be interpreted as arithmetic.
const OPERATOR = '[+*/\\-\\u00f7]';
// An optional leading sign (no space) applies to the first number only, so
// `-32*4` is (-32)*4 and `-5+3` is (-5)+3.
const EXPRESSION_PATTERN = new RegExp(`^([+-]?)(${NUMBER}(?:\\s*${OPERATOR}\\s*${NUMBER})+)$`);
const TOKEN_PATTERN = new RegExp(`${NUMBER}|${OPERATOR}`, 'g');

function evaluateExpression(text, sign = '') {
  const tokens = text.match(TOKEN_PATTERN);
  const first = new Decimal(tokens[0]);
  const values = [sign === '-' ? first.negated() : first];
  const operators = [];
  const precedence = { '+': 1, '-': 1, '*': 2, '/': 2, '\u00f7': 2 };

  function applyOperation() {
    const operator = operators.pop();
    const right = values.pop();
    const left = values.pop();
    if ((operator === '/' || operator === '\u00f7') && right.isZero()) return false;
    const operations = {
      '+': () => left.plus(right),
      '-': () => left.minus(right),
      '*': () => left.times(right),
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

  const expression = text.match(EXPRESSION_PATTERN);
  if (expression) {
    const amount = evaluateExpression(expression[2], expression[1]);
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
