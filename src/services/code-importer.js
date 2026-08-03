'use strict';

const { normalizeCategory } = require('../utilities/normalization');

function validateCodeLines(input) {
  const rows = [];
  const errors = [];
  const seen = new Set();
  let skipped = 0;

  String(input || '').split(/\r?\n/).forEach((line, index) => {
    const code = line.trim().replace(/^\d+[.)]\s+/, '').trim();
    if (!code) return;
    if (/\s/.test(code) || code.length > 512) {
      errors.push(`Line ${index + 1}: codes cannot contain spaces and must be 512 characters or fewer`);
      return;
    }
    if (seen.has(code)) { skipped += 1; return; }
    seen.add(code);
    rows.push(code);
  });

  if (!rows.length && !errors.length) throw new Error('Enter at least one code, with one code per line');
  return { rows, skipped, failed: errors.length, errors };
}

async function importCodeLines(pool, categoryInput, input) {
  const categoryAlias = normalizeCategory(categoryInput);
  if (!categoryAlias) throw new Error('Select a valid category');
  const validation = validateCodeLines(input);
  const client = await pool.connect();
  let imported = 0;
  let skipped = validation.skipped;

  try {
    await client.query('BEGIN');
    const categoryResult = await client.query(
      `SELECT a.category
       FROM category_aliases a
       JOIN code_categories c ON c.category=a.category
       WHERE a.alias=$1 AND c.active=TRUE`,
      [categoryAlias]
    );
    if (!categoryResult.rowCount) throw new Error('The selected category is not active');
    const category = categoryResult.rows[0].category;

    for (const code of validation.rows) {
      const result = await client.query(
        `INSERT INTO codes(category,code) VALUES($1,$2)
         ON CONFLICT(code) DO NOTHING RETURNING id`,
        [category, code]
      );
      if (!result.rowCount) { skipped += 1; continue; }
      imported += 1;
      await client.query(
        `INSERT INTO audit_logs(action,category,code_id,delivery_status)
         VALUES('code_imported',$1,$2,NULL)`,
        [category, result.rows[0].id]
      );
    }
    await client.query('COMMIT');
    return { category, imported, skipped, failed: validation.failed, errors: validation.errors };
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

module.exports = { validateCodeLines, importCodeLines };
