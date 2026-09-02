'use strict';

const { normalizeCategory } = require('./normalization');

const CATEGORY_TOKEN = '[a-z0-9_.$-]+';
const MULTIPLY_TOKEN = '[x×]';
const TAG_PATTERN = new RegExp(`^/tag\\s+(${CATEGORY_TOKEN}?)(?:\\s*(?:([1-9]\\d*)\\s*${MULTIPLY_TOKEN}|${MULTIPLY_TOKEN}\\s*([1-9]\\d*)))?\\s*$`, 'i');
const SHORTHAND_PATTERN = new RegExp(`^(${CATEGORY_TOKEN}?)\\s*${MULTIPLY_TOKEN}\\s*([1-9]\\d*)\\s*$`, 'i');
const INVALID_SHORTHAND_PATTERN = new RegExp(`^${CATEGORY_TOKEN}\\s*${MULTIPLY_TOKEN}`, 'i');

function parseCommand(body) {
  if (typeof body !== 'string') return null;
  const text = body.trim();
  let match = text.match(TAG_PATTERN);
  if (match) {
    const category = normalizeCategory(match[1]);
    const quantity = match[2] || match[3] ? Number(match[2] || match[3]) : 1;
    return category && Number.isSafeInteger(quantity) ? { name: 'tag', category, quantity } : { name: 'invalid' };
  }
  match = text.match(SHORTHAND_PATTERN);
  if (match) {
    const category = normalizeCategory(match[1]);
    const quantity = Number(match[2]);
    return category && Number.isSafeInteger(quantity) ? { name: 'tag', category, quantity } : { name: 'invalid' };
  }
  if (/^\/stock\s*$/i.test(text)) return { name: 'stock' };
  match = text.match(/^\/stock\s+([^\s]+)\s*$/i);
  if (match) {
    const category = normalizeCategory(match[1]);
    return category ? { name: 'stock', category } : { name: 'invalid' };
  }
  if (/^\/groupid\s*$/i.test(text)) return { name: 'groupid' };
  if (/^\/help\s*$/i.test(text)) return { name: 'help' };
  if (/^\/status\s*$/i.test(text)) return { name: 'status' };
  if (/^\/calculate\s*$/i.test(text)) return { name: 'calculate' };
  match = text.match(/^\/setname\s+(.+)$/is);
  if (match) {
    const rest = match[1].replace(/\s+/g, ' ').trim();
    const targeted = rest.match(/^(\S+@g\.us)\s+(.+)$/i);
    if (targeted) return { name: 'setname', targetGroupId: targeted[1], groupName: targeted[2].trim().slice(0, 100) };
    return { name: 'setname', groupName: rest.slice(0, 100) };
  }
  if (/^\/setname\s*$/i.test(text)) return { name: 'setname' };
  if (/^\/(?:tag|stock)\b/i.test(text) || INVALID_SHORTHAND_PATTERN.test(text)) return { name: 'invalid' };
  return null;
}

module.exports = { parseCommand };
