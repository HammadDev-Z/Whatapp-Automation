'use strict';

const { normalizeCategory } = require('./normalization');

function parseCommand(body) {
  if (typeof body !== 'string') return null;
  const text = body.trim();
  let match = text.match(/^\/tag\s+([a-z0-9_-]+?)(?:\s*(?:([1-9]\d*)\s*[x×]|[x×]\s*([1-9]\d*)))?\s*$/i);
  if (match) {
    const category = normalizeCategory(match[1]);
    const quantity = match[2] || match[3] ? Number(match[2] || match[3]) : 1;
    return category && Number.isSafeInteger(quantity) ? { name: 'tag', category, quantity } : { name: 'invalid' };
  }
  match = text.match(/^([a-z0-9_-]+?)\s*[x×]\s*([1-9]\d*)\s*$/i);
  if (match) {
    const category = normalizeCategory(match[1]);
    const quantity = Number(match[2]);
    return category && Number.isSafeInteger(quantity) ? { name: 'tag', category, quantity } : { name: 'invalid' };
  }
  match = text.match(/^\/stock\s+([^\s]+)\s*$/i);
  if (match) {
    const category = normalizeCategory(match[1]);
    return category ? { name: 'stock', category } : { name: 'invalid' };
  }
  if (/^\/groupid\s*$/i.test(text)) return { name: 'groupid' };
  if (/^\/help\s*$/i.test(text)) return { name: 'help' };
  if (/^\/status\s*$/i.test(text)) return { name: 'status' };
  if (/^\/(?:tag|stock)\b/i.test(text) || /^[a-z0-9_-]+\s*[x×]/i.test(text)) return { name: 'invalid' };
  return null;
}

module.exports = { parseCommand };
