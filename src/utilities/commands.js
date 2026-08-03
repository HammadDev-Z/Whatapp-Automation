'use strict';

const { normalizeCategory } = require('./normalization');

function parseCommand(body) {
  if (typeof body !== 'string') return null;
  const text = body.trim();
  let match = text.match(/^\/tag\s+([^\s]+)\s*$/i);
  if (match) {
    const category = normalizeCategory(match[1]);
    return category ? { name: 'tag', category } : { name: 'invalid' };
  }
  match = text.match(/^\/stock\s+([^\s]+)\s*$/i);
  if (match) {
    const category = normalizeCategory(match[1]);
    return category ? { name: 'stock', category } : { name: 'invalid' };
  }
  if (/^\/groupid\s*$/i.test(text)) return { name: 'groupid' };
  if (/^\/help\s*$/i.test(text)) return { name: 'help' };
  if (/^\/status\s*$/i.test(text)) return { name: 'status' };
  if (/^\/(?:tag|stock)\b/i.test(text)) return { name: 'invalid' };
  return null;
}

module.exports = { parseCommand };
