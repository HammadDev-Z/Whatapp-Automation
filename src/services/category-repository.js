'use strict';

const CATEGORY_ORDER_EXPRESSION = `
  CASE c.category
    WHEN '830' THEN 1
    WHEN '2320' THEN 2
    WHEN '5150' THEN 3
    WHEN '13k' THEN 4
    WHEN '27k' THEN 5
    WHEN '56k' THEN 6
    WHEN '68k' THEN 7
    WHEN '224k' THEN 8
    WHEN '1.4m' THEN 9
    ELSE 999
  END`;

class CategoryRepository {
  constructor(pool) { this.pool = pool; }

  async resolve(alias) {
    const result = await this.pool.query(
      `SELECT c.category
       FROM category_aliases a
       JOIN code_categories c ON c.category=a.category
       WHERE a.alias=$1 AND c.active=TRUE`,
      [alias]
    );
    return result.rows[0]?.category || null;
  }

  async listActive() {
    return (await this.pool.query(
      `SELECT c.category, array_agg(a.alias ORDER BY a.alias) AS aliases
       FROM code_categories c
       LEFT JOIN category_aliases a ON a.category=c.category
       WHERE c.active=TRUE
       GROUP BY c.category
       ORDER BY ${CATEGORY_ORDER_EXPRESSION}`
    )).rows;
  }

  async listStock() {
    return (await this.pool.query(
      `SELECT c.category, c.display_name,
        count(code.id) FILTER (WHERE code.status='unused')::int AS unused
       FROM code_categories c
       LEFT JOIN codes code ON code.category=c.category
       WHERE c.active=TRUE
       GROUP BY c.category, c.display_name
       ORDER BY ${CATEGORY_ORDER_EXPRESSION}`
    )).rows;
  }
}

module.exports = { CategoryRepository };
