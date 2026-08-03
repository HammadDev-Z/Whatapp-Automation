'use strict';

const { parse } = require('csv-parse/sync');
const { normalizeCategory } = require('../utilities/normalization');

function validateCsv(input) {
  let records;
  try {
    records = parse(String(input), { skip_empty_lines: true, trim: true, bom: true });
  } catch (error) { throw new Error(`Invalid CSV: ${error.message}`); }
  if (!records.length) throw new Error('CSV must contain category and code columns');
  const headers = records.shift().map((header) => String(header).trim().toLowerCase());
  const categoryIndex = headers.indexOf('category');
  const codeIndex = headers.indexOf('code');
  if (categoryIndex < 0 || codeIndex < 0) throw new Error('CSV must contain category and code columns');

  const rows = [];
  const errors = [];
  const seen = new Set();
  let skipped = 0;
  records.forEach((record, index) => {
    const category = normalizeCategory(record[categoryIndex]);
    const code = String(record[codeIndex] || '').trim();
    if (!category || !code) {
      errors.push(`Row ${index + 2}: invalid category or empty code`);
      return;
    }
    if (seen.has(code)) { skipped += 1; return; }
    seen.add(code);
    rows.push({ category, code });
  });
  return { rows, skipped, failed: errors.length, errors };
}

async function importCsv(pool, input) {
  const validation = validateCsv(input);
  const client = await pool.connect();
  let imported = 0;
  let skipped = validation.skipped;
  let failed = validation.failed;
  try {
    await client.query('BEGIN');
    const supported = new Map((await client.query(
      `SELECT a.alias, a.category
       FROM category_aliases a
       JOIN code_categories c ON c.category=a.category
       WHERE c.active=TRUE`
    )).rows.map((row) => [row.alias, row.category]));
    for (const row of validation.rows) {
      const category = supported.get(row.category);
      if (!category) {
        failed += 1;
        validation.errors.push(`Unsupported category: ${row.category}`);
        continue;
      }
      const result = await client.query(
        `INSERT INTO codes(category,code) VALUES($1,$2)
         ON CONFLICT(code) DO NOTHING RETURNING id`,
        [category, row.code]
      );
      if (result.rowCount) {
        imported += 1;
        await client.query(
          `INSERT INTO audit_logs(action,category,code_id,delivery_status)
           VALUES('code_imported',$1,$2,NULL)`,
          [category, result.rows[0].id]
        );
      } else skipped += 1;
    }
    await client.query('COMMIT');
    return { imported, skipped, failed, errors: validation.errors };
  } catch (error) { await client.query('ROLLBACK'); throw error; } finally { client.release(); }
}

module.exports = { validateCsv, importCsv };
