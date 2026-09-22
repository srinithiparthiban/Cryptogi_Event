const crypto = require('crypto');

const genToken = () => crypto.randomBytes(24).toString('hex');

// Normalizes an email the same way on import and on login, so a participant typing
// their address with different case or stray spaces still matches their roster record.
const normEmail = (e) => String(e || '').trim().toLowerCase();

function httpError(status, message) {
  const e = new Error(message);
  e.status = status;
  return e;
}
const wrap = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

// Deterministic PRNG so a participant's shuffled option/board order is stable across refreshes/restarts.
function hashStr(s) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}
function mulberry32(a) {
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
function shuffle(arr, seed) {
  const rnd = mulberry32(seed >>> 0);
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

module.exports = { genToken, normEmail, httpError, wrap, hashStr, shuffle };
