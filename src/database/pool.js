'use strict';

const { Pool } = require('pg');

function createPool(databaseUrl) {
  return new Pool({ connectionString: databaseUrl, max: 10, idleTimeoutMillis: 30000, connectionTimeoutMillis: 5000 });
}

module.exports = { createPool };
