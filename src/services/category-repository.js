'use strict';

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
       ORDER BY c.category`
    )).rows;
  }
}

module.exports = { CategoryRepository };
