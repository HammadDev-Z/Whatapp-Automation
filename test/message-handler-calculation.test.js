'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { createMessageHandler } = require('../src/commands/message-handler');

function dependencies(overrides = {}) {
  return {
    calculationRepository: { record: async () => ({ duplicate: false, currentTotal: '54.00' }) },
    sleep: async () => {},
    logger: { info() {}, error() {}, warn() {} },
    ...overrides
  };
}

function groupMessage(body) {
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

test('replies to a strict signed calculation', async () => {
  const recorded = [];
  const handler = createMessageHandler(dependencies({
    calculationRepository: {
      record: async (calculation) => {
        recorded.push(calculation);
        return { duplicate: false, currentTotal: '54.00' };
      }
    }
  }));
  const { message, replies } = groupMessage('+54');

  await handler(message);

  assert.equal(recorded.length, 1);
  assert.equal(recorded[0].amount, '54.00');
  assert.equal(replies.length, 1);
  assert.match(replies[0], /^AWAN E-STORE/);
  assert.equal(replies[0].split('\n')[1], '');
  assert.match(replies[0], /All Total:54\.0/);
  assert.doesNotMatch(replies[0], /Thanks/);
});

test('thanks the group when the all total reaches zero', async () => {
  const handler = createMessageHandler(dependencies({
    calculationRepository: {
      record: async () => ({ duplicate: false, currentTotal: '0.00' })
    }
  }));
  const { message, replies } = groupMessage('-54');

  await handler(message);

  assert.equal(replies.length, 1);
  assert.match(replies[0], /^AWAN E-STORE/);
  assert.match(replies[0], /All Total:0\.0/);
  assert.match(replies[0], /Thanks! All calculations are complete\./);
});

test('waits a random 3 to 6 seconds before calculation replies', async () => {
  const delays = [];
  const handler = createMessageHandler(dependencies({
    sleep: async (milliseconds) => delays.push(milliseconds),
    random: () => 0.5
  }));
  const { message } = groupMessage('+10');

  await handler(message);

  assert.deepEqual(delays, [5000]);
});

test('stays silent for plain numbers and mixed text', async () => {
  const handler = createMessageHandler(dependencies());
  for (const body of ['54', 'this ok', '+54 please', '89-54 please']) {
    const { message, replies } = groupMessage(body);
    await handler(message);
    assert.deepEqual(replies, [], body);
  }
});
