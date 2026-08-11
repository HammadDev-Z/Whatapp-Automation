'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { createMessageHandler } = require('../src/commands/message-handler');

function message() {
  const replies = [];
  return {
    value: {
      body: '/tag 830',
      from: 'group@g.us',
      author: 'user@c.us',
      id: 'limit-message',
      reply: async (text) => replies.push(text)
    },
    replies
  };
}

function dependencies(allocationService) {
  return {
    allocationService,
    categoryRepository: { resolve: async () => '830' },
    calculationRepository: {},
    pool: { query: async () => ({ rowCount: 0, rows: [] }) },
    rateLimiter: { consume: () => true },
    sleep: async () => {},
    logger: { info() {}, error() {}, warn() {} }
  };
}

test('replies stock ended when a group limit is already exhausted', async () => {
  const handler = createMessageHandler(dependencies({
    allocate: async () => ({ status: 'limit_reached', dailyLimit: 5 })
  }));
  const { value, replies } = message();

  await handler(value);

  assert.equal(replies.length, 1);
  assert.equal(replies[0], '❌ 830 stock ended');
});

test('issues the remaining codes and then reports stock ended', async () => {
  const handler = createMessageHandler(dependencies({
    allocate: async () => ({
      status: 'allocated',
      codes: [{ codeId: 1, code: 'CODE-1' }, { codeId: 2, code: 'CODE-2' }],
      requestedQuantity: 10,
      limitReached: true,
      dailyLimit: 5
    }),
    recordDelivery: async () => {}
  }));
  const { value, replies } = message();

  await handler(value);

  assert.equal(replies.length, 2);
  assert.match(replies[0], /CODE-1/);
  assert.equal(replies[1], '❌ 830 stock ended');
});
