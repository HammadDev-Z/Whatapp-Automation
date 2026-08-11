'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { parseCommand } = require('../src/utilities/commands');
const { createMessageHandler } = require('../src/commands/message-handler');

function stockMessage(body = '/stock') {
  const replies = [];
  return {
    message: {
      body,
      from: '12345@g.us',
      author: '923001234567@c.us',
      id: `message-${body}`,
      reply: async (text) => replies.push(text)
    },
    replies
  };
}

test('parses stock with and without a category', () => {
  assert.deepEqual(parseCommand('/stock'), { name: 'stock' });
  assert.deepEqual(parseCommand('/stock 5k'), { name: 'stock', category: '5k' });
});

test('stock lists every active category including zero stock', async () => {
  const handler = createMessageHandler({
    categoryRepository: {
      listStock: async () => [
        { category: '830', display_name: '830', unused: 12 },
        { category: '2320', display_name: '2320', unused: 0 },
        { category: '5150', display_name: '5150', unused: 7 }
      ]
    },
    calculationRepository: {},
    isAdmin: async () => true,
    logger: { info() {}, error() {}, warn() {} }
  });
  const { message, replies } = stockMessage();

  await handler(message);

  assert.equal(replies.length, 1);
  assert.match(replies[0], /830: 12/);
  assert.match(replies[0], /2320: 0/);
  assert.match(replies[0], /5150: 7/);
  assert.match(replies[0], /Total: 19/);
});

test('stock remains restricted to administrators', async () => {
  const handler = createMessageHandler({
    calculationRepository: {},
    isAdmin: async () => false,
    logger: { info() {}, error() {}, warn() {} }
  });
  const { message, replies } = stockMessage();

  await handler(message);

  assert.equal(replies.length, 1);
  assert.match(replies[0], /restricted to administrators/);
});
