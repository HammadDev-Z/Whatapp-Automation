'use strict';

const { parseCommand } = require('../utilities/commands');

const HELP = 'Commands:\n/tag <category> - request a code\n/help - show this help\n/groupid - show group ID (admin)\n/stock <category> - remaining stock (admin)\n/status - service status (admin)';

function serializeWid(value) {
  if (!value) return '';
  if (typeof value === 'string') return value;
  if (typeof value._serialized === 'string') return value._serialized;
  if (value.user && value.server) return `${value.user}@${value.server}`;
  return '';
}

function serializeMessageId(id) {
  if (!id) return '';
  if (typeof id === 'string') return id;
  if (typeof id._serialized === 'string' && id._serialized) return id._serialized;
  if (typeof id.id !== 'string' || !id.id) return '';
  return [id.fromMe ? '1' : '0', serializeWid(id.remote), id.id, serializeWid(id.participant)].join('_');
}

async function resolveSender(message, timeoutMs = 2000) {
  const sender = message.author || message.from;
  if (!String(sender).endsWith('@lid')) return sender;
  let timer;
  try {
    return await Promise.race([
      (async () => {
        if (message.getContact) {
          const contact = await message.getContact();
          const contactId = contact?.id?._serialized;
          if (contactId && !contactId.endsWith('@lid')) return contactId;
          if (contact?.number && contact.number !== String(sender).split('@')[0]) return `${contact.number}@c.us`;
        }
        if (message.client?.getContactLidAndPhone) {
          const mappings = await message.client.getContactLidAndPhone([sender]);
          if (mappings?.[0]?.pn) return mappings[0].pn;
        }
        return sender;
      })(),
      new Promise((resolve) => { timer = setTimeout(() => resolve(sender), timeoutMs); })
    ]);
  } catch {
    return sender;
  } finally {
    clearTimeout(timer);
  }
}

function createMessageHandler({ allocationService, categoryRepository, pool, isAdmin, rateLimiter, logger }) {
  const inFlight = new Set();

  return async function handleMessage(message) {
    if (!message || message.fromMe || !String(message.from || '').endsWith('@g.us')) return;
    const command = parseCommand(message.body);
    if (!command) return;
    const groupId = message.from;
    const messageId = serializeMessageId(message.id);
    if (!messageId || inFlight.has(messageId)) return;
    inFlight.add(messageId);
    try {
      const sender = message.author || message.from;
      logger.info('WhatsApp command received', { command: command.name, category: command.category, groupId, messageId });
      if (command.name === 'invalid') { await message.reply('Invalid command. Use /help for supported commands.'); return; }
      if (command.name === 'help') {
        const categories = await categoryRepository.listActive();
        const labels = categories.map(({ category, aliases }) => {
          const extra = (aliases || []).filter((alias) => alias !== category);
          return extra.length ? `${category} (also ${extra.join(', ')})` : category;
        });
        await message.reply(`${HELP}\n\nCategories: ${labels.join(', ')}`);
        return;
      }
      if (['groupid', 'stock', 'status'].includes(command.name)) {
        const adminSender = await resolveSender(message);
        if (!isAdmin(adminSender)) {
          await message.reply('❌ This command is restricted to administrators.'); return;
        }
      }
      if (command.name === 'groupid') { await message.reply(`Group ID: ${groupId}`); return; }
      if (command.name === 'status') {
        try { await pool.query('SELECT 1'); await message.reply('✅ Bot and database are online.'); }
        catch { await message.reply('❌ Database is unavailable.'); }
        return;
      }
      let category = command.category;
      if (command.name === 'tag' || command.name === 'stock') {
        category = await categoryRepository.resolve(command.category);
        if (!category) { await message.reply('❌ Unknown code category. Use /help to see available categories.'); return; }
      }
      if (command.name === 'stock') {
        const result = await pool.query("SELECT count(*)::int AS count FROM codes WHERE category=$1 AND status='unused'", [category]);
        await message.reply(`Remaining ${category} codes: ${result.rows[0].count}`);
        return;
      }
      // This read prevents sequential replays from consuming rate-limit quota.
      // The insert in allocate() remains the authoritative race-safe check.
      const seen = await pool.query('SELECT 1 FROM processed_messages WHERE message_id=$1', [messageId]);
      if (seen.rowCount) return;
      if (!rateLimiter.consume(groupId)) { await message.reply('⏳ Too many requests from this group. Please try again later.'); return; }

      logger.info('Code allocation starting', { category, groupId, messageId });
      const allocation = await allocationService.allocate({ category, groupId, requestedBy: sender, messageId });
      logger.info('Code allocation finished', { category, groupId, messageId, allocationStatus: allocation.status });
      if (allocation.status === 'duplicate') return;
      if (allocation.status === 'unauthorized') { await message.reply('❌ This group is not authorized to request codes.'); return; }
      if (allocation.status === 'out_of_stock') { await message.reply(`❌ No unused ${category} codes are currently available.`); return; }

      try {
        await message.reply(`✅ ${category} code issued\n\nCode: ${allocation.code}`);
        await allocationService.recordDelivery({ codeId: allocation.codeId, category, groupId, requestedBy: sender, messageId, success: true });
      } catch (error) {
        logger.error('WhatsApp delivery failed', { messageId, groupId, error });
        try {
          await allocationService.recordDelivery({ codeId: allocation.codeId, category, groupId, requestedBy: sender, messageId, success: false, error });
        } catch (auditError) { logger.error('Failed to record delivery failure', { messageId, groupId, error: auditError }); }
      }
    } catch (error) { logger.error('Message processing failed', { groupId, messageId, error }); }
    finally { inFlight.delete(messageId); }
  };
}

module.exports = { createMessageHandler, resolveSender, serializeMessageId, HELP };
