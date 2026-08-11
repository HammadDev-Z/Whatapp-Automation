'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { createMessageHandler } = require('../src/commands/message-handler');

test('sends a low-stock alert after successful code delivery', async () => {
  const replies = [];
  const alerts = [];
  const handler = createMessageHandler({
    allocationService: {
      allocate: async () => ({ status: 'allocated', codes: [{ codeId: 1, code: 'SECRET-CODE' }] }),
      recordDelivery: async () => {}
    },
    categoryRepository: { resolve: async () => '830' },
    calculationRepository: {},
    stockMonitor: { check: async () => ({ category: '830', remaining: 9, threshold: 10 }) },
    lowStockAlertGroupId: '99999@g.us',
    pool: { query: async () => ({ rowCount: 0, rows: [] }) },
    isAdmin: async () => false,
    rateLimiter: { consume: () => true },
    sleep: async () => {},
    logger: { info() {}, error() {}, warn() {} }
  });

  await handler({
    body: '/tag 830',
    from: '12345@g.us',
    author: '923001234567@c.us',
    id: 'message-low-stock',
    client: { sendMessage: async (groupId, text) => alerts.push({ groupId, text }) },
    reply: async (text) => replies.push(text)
  });

  assert.equal(replies.length, 1);
  assert.equal(alerts.length, 1);
  assert.equal(alerts[0].groupId, '99999@g.us');
  assert.match(alerts[0].text, /LOW STOCK ALERT/);
  assert.match(alerts[0].text, /830 remaining stock: 9/);
});

test('does not send an alert when no destination group is configured', async () => {
  let stockChecked = false;
  const handler = createMessageHandler({
    allocationService: {
      allocate: async () => ({ status: 'allocated', codes: [{ codeId: 1, code: 'SECRET-CODE' }] }),
      recordDelivery: async () => {}
    },
    categoryRepository: { resolve: async () => '830' },
    calculationRepository: {},
    stockMonitor: { check: async () => { stockChecked = true; } },
    pool: { query: async () => ({ rowCount: 0, rows: [] }) },
    rateLimiter: { consume: () => true },
    sleep: async () => {},
    logger: { info() {}, error() {}, warn() {} }
  });
  await handler({
    body: '/tag 830',
    from: '12345@g.us',
    author: '923001234567@c.us',
    id: 'message-alert-disabled',
    client: { sendMessage: async () => assert.fail('alert must stay disabled') },
    reply: async () => {}
  });
  assert.equal(stockChecked, false);
});
