'use strict';
const fs=require('node:fs/promises');
const path=require('node:path');
const {loadConfig}=require('../src/config');
const {createPool}=require('../src/database/pool');
const {importCsv}=require('../src/services/csv-importer');
async function main(){const filename=process.argv[2];if(!filename)throw new Error('Usage: npm run import-codes -- ./codes.csv');const pool=createPool(loadConfig().databaseUrl);try{const data=await fs.readFile(path.resolve(filename),'utf8');const result=await importCsv(pool,data);console.log(`Import complete: imported=${result.imported} skipped=${result.skipped} failed=${result.failed}`);for(const error of result.errors.slice(0,20))console.error(error);}finally{await pool.end();}}
if(require.main===module)main().catch(e=>{console.error(e.message);process.exitCode=1;});
