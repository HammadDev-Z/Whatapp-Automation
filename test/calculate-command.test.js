'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { parseCommand } = require('../src/utilities/commands');
const { createMessageHandler, resolveGroupName } = require('../src/commands/message-handler');

const REPORT_GROUP = '120363000000000000@g.us';

test('parseCommand recognizes /calculate', () => {
  assert.deepEqual(parseCommand('/calculate'), { name: 'calculate' });
  assert.deepEqual(parseCommand('  /CALCULATE  '), { name: 'calculate' });
  assert.equal(parseCommand('/calculate now'), null);
});

const BROADCAST_GROUP = '120363111111111111@g.us';

function buildHandler(balances, calcRepoOverrides = {}, { isAdmin = async () => false, broadcastGroupId = '', logger } = {}) {
  const replies = [];
  const handler = createMessageHandler({
    allocationService: {},
    categoryRepository: {},
    calculationRepository: { listBalances: async () => balances, ...calcRepoOverrides },
    stockMonitor: null,
    pool: {},
    isAdmin,
    rateLimiter: { consume: () => true },
    calculationReportGroupId: REPORT_GROUP,
    broadcastGroupId,
    sleep: async () => {},
    random: () => 0,
    logger: logger || { info() {}, warn() {}, error() {} }
  });
  return { handler, replies };
}

function message(body, from, replies) {
  return {
    body,
    from,
    fromMe: false,
    id: `msg-${Math.random()}`,
    author: '923000000000@c.us',
    reply: async (text) => { replies.push(text); }
  };
}

function broadcastMessage(body, from, replies, sent) {
  const msg = message(body, from, replies);
  msg.client = { sendMessage: async (groupId, text) => { sent.push({ groupId, text }); } };
  return msg;
}

test('/calculate in the report group lists every group balance with a grand total', async () => {
  const { handler, replies } = buildHandler([
    { group_id: 'k@g.us', group_name: 'khan group', current_total: '500.00' },
    { group_id: 'j@g.us', group_name: 'jerry group', current_total: '-900.00' }
  ]);

  await handler(message('/calculate', REPORT_GROUP, replies));

  assert.equal(replies.length, 1);
  assert.match(replies[0], /khan group: 500\.0/);
  assert.match(replies[0], /jerry group: -900\.0/);
  assert.match(replies[0], /Grand Total: -400\.0/);
});

test('/calculate falls back to the group id when no name is known', async () => {
  const { handler, replies } = buildHandler([
    { group_id: 'unknown@g.us', group_name: null, current_total: '12.50' }
  ]);

  await handler(message('/calculate', REPORT_GROUP, replies));

  assert.match(replies[0], /unknown@g\.us: 12\.50/);
  assert.match(replies[0], /Grand Total: 12\.50/);
});

test('/calculate reports when nothing has been recorded', async () => {
  const { handler, replies } = buildHandler([]);

  await handler(message('/calculate', REPORT_GROUP, replies));

  assert.equal(replies.length, 1);
  assert.match(replies[0], /No group calculations/i);
});

test('/calculate is ignored outside the report group', async () => {
  const { handler, replies } = buildHandler([
    { group_id: 'k@g.us', group_name: 'khan group', current_total: '500.00' }
  ]);

  await handler(message('/calculate', '999999999999999999@g.us', replies));

  assert.equal(replies.length, 0);
});

test('resolveGroupName reads the chat subject and tolerates failure', async () => {
  assert.equal(await resolveGroupName({ getChat: async () => ({ name: '  khan group  ' }) }), 'khan group');
  assert.equal(await resolveGroupName({ getChat: async () => ({ name: '' }) }), null);
  assert.equal(await resolveGroupName({ getChat: async () => { throw new Error('offline'); } }), null);
  assert.equal(await resolveGroupName({}), null);
});

test('a calculation stores the WhatsApp group name it was posted in', async () => {
  let recorded = null;
  const { handler, replies } = buildHandler([], {
    record: async (payload) => { recorded = payload; return { duplicate: false, currentTotal: '30.00' }; }
  });
  const msg = message('10+20', 'somerandomgroup@g.us', replies);
  msg.getChat = async () => ({ name: 'Karachi Buyers' });

  await handler(msg);

  assert.equal(recorded.groupName, 'Karachi Buyers');
  assert.equal(recorded.groupId, 'somerandomgroup@g.us');
  assert.match(replies[0], /All Total:30\.0/);
});

test('a calculation still records when getChat throws (name left null)', async () => {
  let recorded = null;
  const { handler } = buildHandler([], {
    record: async (payload) => { recorded = payload; return { duplicate: false, currentTotal: '30.00' }; }
  });
  const msg = message('10+20', 'g@g.us', []);
  msg.getChat = async () => { throw new Error('r'); };

  await handler(msg);

  assert.equal(recorded.groupName, null);
});

test('parseCommand parses /setname', () => {
  assert.deepEqual(parseCommand('/setname Khan Group'), { name: 'setname', groupName: 'Khan Group' });
  assert.deepEqual(parseCommand('/setname   Jerry   Store  '), { name: 'setname', groupName: 'Jerry Store' });
  assert.deepEqual(parseCommand('/setname 120363111@g.us Faisalabad Dealers'),
    { name: 'setname', targetGroupId: '120363111@g.us', groupName: 'Faisalabad Dealers' });
  assert.deepEqual(parseCommand('/setname'), { name: 'setname' });
});

test('/setname from an admin stores the label for the current group', async () => {
  let saved = null;
  const { handler, replies } = buildHandler([], {
    setGroupName: async (id, name) => { saved = { id, name }; }
  }, { isAdmin: async () => true });

  await handler(message('/setname Khan Group', 'khan@g.us', replies));

  assert.deepEqual(saved, { id: 'khan@g.us', name: 'Khan Group' });
  assert.match(replies[0], /Khan Group/);
});

test('/setname with an explicit id targets that group', async () => {
  let saved = null;
  const { handler, replies } = buildHandler([], {
    setGroupName: async (id, name) => { saved = { id, name }; }
  }, { isAdmin: async () => true });

  await handler(message('/setname jerry@g.us Jerry Store', REPORT_GROUP, replies));

  assert.deepEqual(saved, { id: 'jerry@g.us', name: 'Jerry Store' });
});

test('/setname is refused for non-admins', async () => {
  let saved = null;
  const { handler, replies } = buildHandler([], {
    setGroupName: async (id, name) => { saved = { id, name }; }
  }, { isAdmin: async () => false });

  await handler(message('/setname Khan Group', 'khan@g.us', replies));

  assert.equal(saved, null);
  assert.match(replies[0], /administrator/i);
});

test('parseCommand recognizes /pkr and /usdt, bare and with a broadcast message', () => {
  assert.deepEqual(parseCommand('/pkr'), { name: 'currency', currency: 'pkr', message: null });
  assert.deepEqual(parseCommand('  /USDT \n'), { name: 'currency', currency: 'usdt', message: null });
  assert.deepEqual(parseCommand('/usdt   '), { name: 'currency', currency: 'usdt', message: null });
  assert.deepEqual(parseCommand('/pkr Eid offer for everyone'),
    { name: 'currency', currency: 'pkr', message: 'Eid offer for everyone' });
  // Trailing text makes it a broadcast attempt, not an invalid command — whether it
  // actually broadcasts is gated at the handler level by the control group check.
  assert.deepEqual(parseCommand('/pkr usdt'), { name: 'currency', currency: 'pkr', message: 'usdt' });
  assert.equal(parseCommand('/usd'), null);
  assert.equal(parseCommand('pkr'), null);
  assert.equal(parseCommand('/pkrhello'), null);
});

test('parseCommand recognizes /account, bare and with a message', () => {
  assert.deepEqual(parseCommand('/account'), { name: 'account', message: null });
  assert.deepEqual(parseCommand('/account Bank: ABC, IBAN: 123'), { name: 'account', message: 'Bank: ABC, IBAN: 123' });
  assert.deepEqual(parseCommand('  /ACCOUNT  '), { name: 'account', message: null });
});

test('/pkr from an admin sets the group currency and confirms', async () => {
  let saved = null;
  const { handler, replies } = buildHandler([], {
    setCurrency: async (payload) => { saved = payload; }
  }, { isAdmin: async () => true });

  await handler(message('/pkr', 'khan@g.us', replies));

  assert.deepEqual(saved, { groupId: 'khan@g.us', currency: 'pkr' });
  assert.deepEqual(replies, ['✅ Currency set to PKR']);
});

test('/usdt from an admin, mixed case and extra whitespace, sets the currency and confirms', async () => {
  let saved = null;
  const { handler, replies } = buildHandler([], {
    setCurrency: async (payload) => { saved = payload; }
  }, { isAdmin: async () => true });

  await handler(message('  /USDT \n', 'khan@g.us', replies));

  assert.deepEqual(saved, { groupId: 'khan@g.us', currency: 'usdt' });
  assert.deepEqual(replies, ['✅ Currency set to USDT']);
});

test('invalid currency forms are ignored and get no reply', async () => {
  let called = false;
  const { handler, replies } = buildHandler([], {
    setCurrency: async () => { called = true; }
  }, { isAdmin: async () => true });

  await handler(message('/usd', 'khan@g.us', replies));
  await handler(message('pkr', 'khan@g.us', replies));

  assert.equal(called, false);
  assert.equal(replies.length, 0);
});

test('/usdt is refused for non-admins', async () => {
  let called = false;
  const { handler, replies } = buildHandler([], {
    setCurrency: async () => { called = true; }
  }, { isAdmin: async () => false });

  await handler(message('/usdt', 'khan@g.us', replies));

  assert.equal(called, false);
  assert.match(replies[0], /administrator/i);
});

test('/usdt from a private chat is ignored entirely (no group suffix)', async () => {
  let called = false;
  const { handler, replies } = buildHandler([], {
    setCurrency: async () => { called = true; }
  }, { isAdmin: async () => true });

  await handler(message('/usdt', '923000000000@c.us', replies));

  assert.equal(called, false);
  assert.equal(replies.length, 0);
});

test('a failing setCurrency is logged and nothing is sent', async () => {
  const errors = [];
  const { handler, replies } = buildHandler([], {
    setCurrency: async () => { throw new Error('db down'); }
  }, { isAdmin: async () => true, logger: { info() {}, warn() {}, error: (...args) => errors.push(args) } });

  await handler(message('/pkr', 'khan@g.us', replies));

  assert.equal(replies.length, 0);
  assert.equal(errors.length, 1);
});

test('/pkr <message> outside the broadcast group is ignored even for an admin', async () => {
  let called = false;
  const { handler, replies } = buildHandler([], {
    listActiveGroupIds: async () => { called = true; return []; }
  }, { isAdmin: async () => true, broadcastGroupId: BROADCAST_GROUP });

  await handler(message('/pkr Eid offer', 'khan@g.us', replies));

  assert.equal(called, false);
  assert.equal(replies.length, 0);
});

test('/pkr <message> from the broadcast group sends only to active pkr groups, excluding itself', async () => {
  let requestedCurrency = null;
  const sent = [];
  const { handler, replies } = buildHandler([], {
    listActiveGroupIds: async (currency) => { requestedCurrency = currency; return ['a@g.us', 'b@g.us', BROADCAST_GROUP]; }
  }, { isAdmin: async () => true, broadcastGroupId: BROADCAST_GROUP });

  await handler(broadcastMessage('/pkr Eid offer for everyone', BROADCAST_GROUP, replies, sent));

  assert.equal(requestedCurrency, 'pkr');
  assert.deepEqual(sent.map((item) => item.groupId).sort(), ['a@g.us', 'b@g.us']);
  assert.ok(sent.every((item) => item.text === 'Eid offer for everyone'));
  assert.deepEqual(replies, ['✅ Broadcast sent to 2 PKR groups.']);
});

test('/usdt <message> from the broadcast group sends only to usdt groups', async () => {
  let requestedCurrency = null;
  const sent = [];
  const { handler, replies } = buildHandler([], {
    listActiveGroupIds: async (currency) => { requestedCurrency = currency; return ['u@g.us']; }
  }, { isAdmin: async () => true, broadcastGroupId: BROADCAST_GROUP });

  await handler(broadcastMessage('/usdt New rate', BROADCAST_GROUP, replies, sent));

  assert.equal(requestedCurrency, 'usdt');
  assert.deepEqual(replies, ['✅ Broadcast sent to 1 USDT group.']);
});

test('/account <message> from the broadcast group sends to every active group regardless of currency', async () => {
  let calledWithCurrency = 'not-called';
  const sent = [];
  const { handler, replies } = buildHandler([], {
    listActiveGroupIds: async (currency = null) => { calledWithCurrency = currency; return ['a@g.us', 'u@g.us']; }
  }, { isAdmin: async () => true, broadcastGroupId: BROADCAST_GROUP });

  await handler(broadcastMessage('/account Bank: ABC, IBAN: 123', BROADCAST_GROUP, replies, sent));

  assert.equal(calledWithCurrency, null);
  assert.deepEqual(sent.map((item) => item.groupId).sort(), ['a@g.us', 'u@g.us']);
  assert.deepEqual(replies, ['✅ Account details sent to 2 groups.']);
});

test('/account with no message from the broadcast group gets a usage hint', async () => {
  const sent = [];
  const { handler, replies } = buildHandler([], {}, { isAdmin: async () => true, broadcastGroupId: BROADCAST_GROUP });

  await handler(broadcastMessage('/account', BROADCAST_GROUP, replies, sent));

  assert.equal(sent.length, 0);
  assert.match(replies[0], /Usage: \/account/);
});

test('/account outside the broadcast group is ignored', async () => {
  let called = false;
  const { handler, replies } = buildHandler([], {
    listActiveGroupIds: async () => { called = true; return []; }
  }, { isAdmin: async () => true, broadcastGroupId: BROADCAST_GROUP });

  await handler(message('/account Bank: ABC', 'khan@g.us', replies));

  assert.equal(called, false);
  assert.equal(replies.length, 0);
});

test('the receipt uses the pkr emoji, the usdt emoji, or falls back to pkr for an unknown currency', async () => {
  async function receiptFor(currency) {
    const { handler, replies } = buildHandler([], {
      record: async () => ({ duplicate: false, currentTotal: '110.00', currency })
    });
    await handler(message('+10', 'g@g.us', replies));
    return replies[0];
  }

  assert.match(await receiptFor('pkr'), /👉All Total:110\.0$/m);
  assert.match(await receiptFor('usdt'), /💰All Total:110\.0$/m);
  assert.match(await receiptFor('made-up-currency'), /👉All Total:110\.0$/m);
});
