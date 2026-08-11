'use strict';

const LOW_STOCK_THRESHOLDS = Object.freeze({
  '830': 10,
  '2320': 10,
  '5150': 10,
  '13k': 4,
  '27k': 2,
  '56k': 2
});

class StockMonitor {
  constructor(pool) { this.pool = pool; }

  async check(category) {
    const threshold = LOW_STOCK_THRESHOLDS[category];
    if (!threshold) return null;
    const result = await this.pool.query(
      "SELECT count(*)::int AS count FROM codes WHERE category=$1 AND status='unused'",
      [category]
    );
    const remaining = Number(result.rows[0].count);
    return remaining < threshold ? { category, remaining, threshold } : null;
  }
}

module.exports = { LOW_STOCK_THRESHOLDS, StockMonitor };
