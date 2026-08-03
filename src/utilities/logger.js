'use strict';

function log(level, message, fields = {}) {
  const safe = { ...fields };
  for (const key of Object.keys(safe)) {
    if (/code|password|secret|credential/i.test(key)) delete safe[key];
    if (safe[key] instanceof Error) safe[key] = safe[key].message;
  }
  const method = level === 'error' ? console.error : console.log;
  method(JSON.stringify({ timestamp: new Date().toISOString(), level, message, ...safe }));
}

module.exports = { info: (m, f) => log('info', m, f), error: (m, f) => log('error', m, f), warn: (m, f) => log('warn', m, f) };
