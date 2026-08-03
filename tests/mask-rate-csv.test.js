'use strict';
const test=require('node:test');const assert=require('node:assert/strict');
const {maskCode}=require('../src/utilities/mask');const {GroupRateLimiter}=require('../src/services/group-rate-limiter');const {validateCsv}=require('../src/services/csv-importer');
test('masks codes without exposing the complete value',()=>{assert.equal(maskCode('ABC-5K-001'),'ABC-****-001');assert.equal(maskCode('SECRET123'),'SEC****123');assert.notEqual(maskCode('ABCD'),'ABCD');});
test('rate limits independently per group and resets after window',()=>{let now=0;const limiter=new GroupRateLimiter({limit:2,windowMs:100,now:()=>now});assert.equal(limiter.consume('a'),true);assert.equal(limiter.consume('a'),true);assert.equal(limiter.consume('a'),false);assert.equal(limiter.consume('b'),true);now=101;assert.equal(limiter.consume('a'),true);});
test('validates CSV, normalizes categories, and detects duplicates',()=>{const result=validateCsv('category,code\n 5K , ABC-1 \n5k,ABC-1\npremium,XYZ-2\nbad!,X\n10k,');assert.deepEqual(result.rows,[{category:'5k',code:'ABC-1'},{category:'premium',code:'XYZ-2'}]);assert.equal(result.skipped,1);assert.equal(result.failed,2);});
test('requires category and code CSV headers',()=>{assert.throws(()=>validateCsv('thing,value\na,b'),/category and code/);});
test('validates headers even when the CSV has no data rows',()=>{assert.deepEqual(validateCsv('category,code\n'),{rows:[],skipped:0,failed:0,errors:[]});assert.throws(()=>validateCsv('thing,value\n'),/category and code/);assert.throws(()=>validateCsv(''),/category and code/);});
