'use strict';

const crypto = require('node:crypto');
const express = require('express');
const { importCodeLines } = require('../services/code-importer');

const MAX_CODES_PER_REQUEST = 1000;

// Compare through a hash so the length of the key never leaks via timing.
function keyMatches(provided, expected) {
  const a = crypto.createHash('sha256').update(String(provided)).digest();
  const b = crypto.createHash('sha256').update(String(expected)).digest();
  return crypto.timingSafeEqual(a, b);
}

/**
 * Machine-to-machine stock import, used by the Razer purchase bot.
 *
 *   POST /api/stock/import
 *   Authorization: Bearer <STOCK_API_KEY>
 *   {"category": "5k", "codes": ["PIN1", "PIN2"]}
 *
 * Reuses the dashboard importer, so aliases (5k -> 5150), the unique `code`
 * column (repeats are skipped, never duplicated) and the audit log all behave
 * exactly as for a dashboard import. Disabled (404) until STOCK_API_KEY is set.
 */
function createStockApiRouter({ pool, config, maxFailures = 10, windowMs = 10 * 60 * 1000 }) {
  const router = express.Router();
  // Failed-key throttle per client address: guessing the key is not practical.
  const failures = new Map();
  const blocked = (ip) => {
    const entry = failures.get(ip);
    if (!entry) return false;
    if (Date.now() > entry.resetAt) { failures.delete(ip); return false; }
    return entry.count >= maxFailures;
  };
  const recordFailure = (ip) => {
    const entry = failures.get(ip);
    if (!entry || Date.now() > entry.resetAt) failures.set(ip, { count: 1, resetAt: Date.now() + windowMs });
    else entry.count += 1;
  };

  router.post('/api/stock/import', express.json({ limit: '250kb' }), async (req, res) => {
    if (!config.stockApiKey) return res.status(404).json({ error: 'not_found' });
    if (blocked(req.ip)) return res.status(429).json({ error: 'too_many_failed_attempts' });
    const header = req.get('authorization') || '';
    const token = header.startsWith('Bearer ') ? header.slice(7).trim() : '';
    if (!token || !keyMatches(token, config.stockApiKey)) {
      recordFailure(req.ip);
      return res.status(401).json({ error: 'unauthorized' });
    }
    failures.delete(req.ip);

    const { category, codes } = req.body || {};
    if (
      typeof category !== 'string' ||
      !Array.isArray(codes) ||
      codes.length === 0 ||
      codes.length > MAX_CODES_PER_REQUEST ||
      codes.some((code) => typeof code !== 'string')
    ) {
      return res.status(400).json({ error: 'invalid_request' });
    }

    try {
      const result = await importCodeLines(pool, category, codes.join('\n'));
      return res.json({
        category: result.category,
        imported: result.imported,
        skipped: result.skipped,
        failed: result.failed
      });
    } catch (error) {
      if (/category|code|line/i.test(error.message)) {
        return res.status(400).json({ error: 'rejected', message: error.message });
      }
      return res.status(500).json({ error: 'server_error' });
    }
  });

  // Bad JSON or an oversized body: answer in JSON, without echoing the input.
  router.use('/api/stock', (error, _req, res, next) => {
    if (error.type === 'entity.too.large') return res.status(413).json({ error: 'too_large' });
    if (error.type === 'entity.parse.failed') return res.status(400).json({ error: 'invalid_json' });
    return next(error);
  });

  return router;
}

module.exports = { createStockApiRouter };
