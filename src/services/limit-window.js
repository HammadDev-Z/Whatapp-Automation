'use strict';

const DAY_MS = 24 * 60 * 60 * 1000;
const PAKISTAN_OFFSET_MS = 5 * 60 * 60 * 1000;

function latestPakistanNoon(now = new Date()) {
  const shifted = new Date(now.getTime() + PAKISTAN_OFFSET_MS);
  let noon = Date.UTC(shifted.getUTCFullYear(), shifted.getUTCMonth(), shifted.getUTCDate(), 12);
  if (shifted.getTime() < noon) noon -= DAY_MS;
  return new Date(noon - PAKISTAN_OFFSET_MS);
}

function activeLimitWindowStart(manualStart, now = new Date()) {
  if (!manualStart) return latestPakistanNoon(now);
  const start = new Date(manualStart);
  if (!Number.isFinite(start.getTime())) return latestPakistanNoon(now);
  const elapsed = Math.max(0, now.getTime() - start.getTime());
  return new Date(start.getTime() + Math.floor(elapsed / DAY_MS) * DAY_MS);
}

module.exports = { activeLimitWindowStart, latestPakistanNoon };
