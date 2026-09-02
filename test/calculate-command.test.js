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

function buildHandler(balances, calcRepoOverrides = {}, { isAdmin = async () => false } = {}) {
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
    sleep: async () => {},
    random: () => 0,
    logger: { info() {}, warn() {}, error() {} }
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
