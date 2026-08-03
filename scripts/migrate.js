'use strict';

const fs = require('node:fs/promises');
const path = require('node:path');
const { loadConfig } = require('../src/config');
const { createPool } = require('../src/database/pool');

async function migrate() {
  const pool = createPool(loadConfig().databaseUrl);
  try {
    await pool.query('CREATE TABLE IF NOT EXISTS schema_migrations (name TEXT PRIMARY KEY, applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW())');
    const dir = path.join(__dirname, '..', 'migrations');
    const files = (await fs.readdir(dir)).filter((f) => f.endsWith('.sql')).sort();
    for (const file of files) {
      const exists = await pool.query('SELECT 1 FROM schema_migrations WHERE name=$1', [file]);
      if (exists.rowCount) { console.log(`Already applied: ${file}`); continue; }
      const client = await pool.connect();
      try {
        await client.query('BEGIN');
        await client.query(await fs.readFile(path.join(dir, file), 'utf8'));
        await client.query('INSERT INTO schema_migrations(name) VALUES($1)', [file]);
        await client.query('COMMIT');
        console.log(`Applied: ${file}`);
      } catch (error) { await client.query('ROLLBACK'); throw error; } finally { client.release(); }
    }
  } finally { await pool.end(); }
}

if (require.main === module) migrate().catch((e) => { console.error(e.stack || e.message || String(e)); process.exitCode = 1; });
module.exports = { migrate };
