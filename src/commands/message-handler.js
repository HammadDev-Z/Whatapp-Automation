'use strict';

const { parseCommand } = require('../utilities/commands');
const { parseCalculation } = require('../services/calculator');
const Decimal = require('decimal.js');

const HELP = 'Commands:\n/tag <category> [quantityx] - request one or more codes\n<category> x <quantity> - quantity shorthand (example: 2320x5)\n/help - show this help\n/groupid - show group ID (admin)\n/stock - all remaining stock (admin)\n/stock <category> - category stock (admin)\n/status - service status (admin)';

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

function formatCodeList(items) {
  const lines = items.map((item, index) => `${index + 1}. ${item.code}`);
  const groups = [];
  for (let index = 0; index < lines.length; index += 10) groups.push(lines.slice(index, index + 10).join('\n'));
  return groups.join('\n\n\n');
}

function randomDelayMs(minSeconds, maxSeconds, random = Math.random) {
  const min = Math.ceil(minSeconds);
  const max = Math.floor(maxSeconds);
  return (min + Math.floor(random() * (max - min + 1))) * 1000;
}

function formatAmount(value) {
  const fixed = new Decimal(value).toDecimalPlaces(2).toFixed(2);
  return fixed.endsWith('00') ? `${fixed.slice(0, -2)}0` : fixed;
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

function createMessageHandler({ allocationService, categoryRepository, calculationRepository, stockMonitor, lowStockAlertGroupId = '', pool, isAdmin, rateLimiter, maxCodesPerRequest = 50, tagDelayMinSeconds = 5, tagDelayMaxSeconds = 10, sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms)), random = Math.random, logger }) {
  const inFlight = new Set();

  return async function handleMessage(message) {
    if (!message || message.fromMe || !String(message.from || '').endsWith('@g.us')) return;
    const calculation = parseCalculation(message.body);
    const command = calculation ? null : parseCommand(message.body);
    if (!calculation && !command) return;
    const groupId = message.from;
    const messageId = serializeMessageId(message.id);
    if (!messageId || inFlight.has(messageId)) return;
    inFlight.add(messageId);
    try {
      const sender = message.author || message.from;
      if (calculation) {
        const result = await calculationRepository.record({
          groupId,
          messageId,
          sender,
          expression: calculation.expression,
          amount: calculation.amount,
          type: calculation.type
        });
        if (result.duplicate) return;
        const expressionLine = calculation.type === 'adjustment'
          ? formatAmount(calculation.amount)
          : `① ${calculation.expression}=${formatAmount(calculation.amount)}`;
        const responseLines = [
          'AWAN E-STORE',
          '',
          '🎉 Start To Work 🎉',
          expressionLine,
          `Cur Total: ${formatAmount(calculation.amount)}`,
          '',
          `All Total:${formatAmount(result.currentTotal)}`
        ];
        if (new Decimal(result.currentTotal).isZero()) {
          responseLines.push('', '✅ Thanks! All clear.');
        }
        await sleep(randomDelayMs(3, 6, random));
        await message.reply(responseLines.join('\n'));
        return;
      }
      logger.info('WhatsApp command received', { command: command.name, category: command.category, quantity: command.quantity, groupId, messageId });
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
        const allowed = await Promise.resolve(isAdmin(adminSender));
        if (!allowed) {
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
      if (command.name === 'tag' || (command.name === 'stock' && command.category)) {
        category = await categoryRepository.resolve(command.category);
        if (!category) { await message.reply('❌ Unknown code category. Use /help to see available categories.'); return; }
      }
      if (command.name === 'tag' && command.quantity > maxCodesPerRequest) {
        await message.reply(`❌ A maximum of ${maxCodesPerRequest} codes can be requested at once.`);
        return;
      }
      if (command.name === 'stock') {
        if (!category) {
          const inventory = await categoryRepository.listStock();
          const total = inventory.reduce((sum, item) => sum + Number(item.unused), 0);
          const lines = inventory.map((item) => `${item.display_name}: ${item.unused}`);
          await message.reply(['📦 Remaining stock', '', ...lines, '', `Total: ${total}`].join('\n'));
          return;
        }
        const result = await pool.query("SELECT count(*)::int AS count FROM codes WHERE category=$1 AND status='unused'", [category]);
        await message.reply(`Remaining ${category} codes: ${result.rows[0].count}`);
        return;
      }
      // This read prevents sequential replays from consuming rate-limit quota.
      // The insert in allocate() remains the authoritative race-safe check.
      const seen = await pool.query('SELECT 1 FROM processed_messages WHERE message_id=$1', [messageId]);
      if (seen.rowCount) return;
      if (!rateLimiter.consume(groupId)) { await message.reply('⏳ Too many requests from this group. Please try again later.'); return; }

      logger.info('Code allocation starting', { category, quantity: command.quantity, groupId, messageId });
      const allocation = await allocationService.allocate({ category, groupId, requestedBy: sender, messageId, quantity: command.quantity });
      logger.info('Code allocation finished', { category, groupId, messageId, allocationStatus: allocation.status });
      if (allocation.status === 'duplicate') return;
      if (allocation.status === 'unauthorized') { await message.reply('❌ This group is not authorized to request codes.'); return; }
      if (allocation.status === 'limit_reached') {
        await message.reply(`❌ ${category} stock ended`);
        return;
      }
      if (allocation.status === 'out_of_stock') {
        const available = allocation.availableQuantity || 0;
        await message.reply(available
          ? `❌ Only ${available} unused ${category} codes are available; ${command.quantity} were requested.`
          : `❌ No unused ${category} codes are currently available.`);
        return;
      }

      const issued = allocation.codes || [{ codeId: allocation.codeId, code: allocation.code }];
      let delivered = false;
      try {
        const delayMs = randomDelayMs(tagDelayMinSeconds, tagDelayMaxSeconds, random);
        logger.info('Delaying code response', { category, quantity: issued.length, groupId, messageId, delayMs });
        await sleep(delayMs);
        const reply = issued.length === 1
          ? `✅ ${category} code issued\n\nCode: ${issued[0].code}`
          : `✅ ${issued.length} × ${category} codes issued\n\n${formatCodeList(issued)}`;
        await message.reply(reply);
        await allocationService.recordDelivery({ codeIds: issued.map((item) => item.codeId), category, groupId, requestedBy: sender, messageId, success: true });
        delivered = true;
      } catch (error) {
        logger.error('WhatsApp delivery failed', { messageId, groupId, error });
        try {
          const issued = allocation.codes || [{ codeId: allocation.codeId }];
          await allocationService.recordDelivery({ codeIds: issued.map((item) => item.codeId), category, groupId, requestedBy: sender, messageId, success: false, error });
        } catch (auditError) { logger.error('Failed to record delivery failure', { messageId, groupId, error: auditError }); }
      }
      if (delivered && allocation.limitReached) {
        try {
          await message.reply(`❌ ${category} stock ended`);
        } catch (error) {
          logger.warn?.('Failed to send group limit notice', { messageId, groupId, error });
        }
      } else if (delivered && allocation.partial) {
        try {
          await message.reply(`❌ ${category} stock is finished. ${issued.length} codes were issued out of ${allocation.requestedQuantity} requested.`);
        } catch (error) {
          logger.warn?.('Failed to send stock-ended notice', { messageId, groupId, error });
        }
      }
      if (delivered && stockMonitor && lowStockAlertGroupId) {
        try {
          const lowStock = await stockMonitor.check(category);
          if (lowStock) {
            await message.client.sendMessage(lowStockAlertGroupId, [
              '⚠️ LOW STOCK ALERT',
              `${lowStock.category} remaining stock: ${lowStock.remaining}`,
              `Alert level: below ${lowStock.threshold}`
            ].join('\n'));
          }
        } catch (error) {
          logger.warn?.('Failed to check or send low stock alert', { category, groupId, alertGroupId: lowStockAlertGroupId, messageId, error });
        }
      }
    } catch (error) { logger.error('Message processing failed', { groupId, messageId, error }); }
    finally { inFlight.delete(messageId); }
  };
}

module.exports = { createMessageHandler, resolveSender, serializeMessageId, formatCodeList, randomDelayMs, HELP };
