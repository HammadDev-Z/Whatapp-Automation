'use strict';

function maskCode(code) {
  if (!code) return '';
  const value = String(code);
  if (value.length <= 4) return '*'.repeat(value.length);
  if (value.includes('-')) {
    const parts = value.split('-');
    if (parts.length >= 3) return `${parts[0]}-${'*'.repeat(Math.max(4, parts.slice(1, -1).join('-').length))}-${parts.at(-1)}`;
  }
  return `${value.slice(0, 3)}${'*'.repeat(Math.max(4, value.length - 6))}${value.slice(-3)}`;
}

module.exports = { maskCode };
