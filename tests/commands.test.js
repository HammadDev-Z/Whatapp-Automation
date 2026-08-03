'use strict';
const test=require('node:test');const assert=require('node:assert/strict');
const {parseCommand}=require('../src/utilities/commands');
const {normalizeCategory,normalizePhone,makeAdminChecker}=require('../src/utilities/normalization');
test('parses commands case-insensitively with flexible spacing',()=>{assert.deepEqual(parseCommand(' /TAG    PreMium '),{name:'tag',category:'premium'});assert.deepEqual(parseCommand('/stock 10K'),{name:'stock',category:'10k'});});
test('rejects malformed categories and commands safely',()=>{assert.deepEqual(parseCommand('/tag bad!'),{name:'invalid'});assert.deepEqual(parseCommand('/tag two words'),{name:'invalid'});assert.equal(parseCommand('hello'),null);});
test('normalizes dynamic categories',()=>{assert.equal(normalizeCategory(' New-Tier_2 '),'new-tier_2');assert.equal(normalizeCategory('../bad'),null);});
test('normalizes WhatsApp administrator numbers',()=>{assert.equal(normalizePhone('+92 (300) 123-4567@c.us'),'923001234567');assert.equal(normalizePhone('00923001234567'),'923001234567');const isAdmin=makeAdminChecker('+923001234567, 923009876543');assert.equal(isAdmin('923001234567@c.us'),true);assert.equal(isAdmin('923001111111@c.us'),false);});
