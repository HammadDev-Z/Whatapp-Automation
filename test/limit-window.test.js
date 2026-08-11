'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { activeLimitWindowStart, latestPakistanNoon } = require('../src/services/limit-window');

test('default window starts at the latest 12 PM Pakistan time', () => {
  assert.equal(
    latestPakistanNoon(new Date('2026-08-12T08:00:00Z')).toISOString(),
    '2026-08-12T07:00:00.000Z'
  );
  assert.equal(
    latestPakistanNoon(new Date('2026-08-12T06:59:59Z')).toISOString(),
    '2026-08-11T07:00:00.000Z'
  );
});

test('manual reset creates repeating 24-hour cycles', () => {
  const manualStart = new Date('2026-08-10T10:30:00Z');
  assert.equal(
    activeLimitWindowStart(manualStart, new Date('2026-08-11T09:00:00Z')).toISOString(),
    '2026-08-10T10:30:00.000Z'
  );
  assert.equal(
    activeLimitWindowStart(manualStart, new Date('2026-08-12T11:00:00Z')).toISOString(),
    '2026-08-12T10:30:00.000Z'
  );
});
