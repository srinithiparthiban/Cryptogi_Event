const router = require('express').Router();
const crypto = require('crypto');
const jwt = require('jsonwebtoken');
const multer = require('multer');
const { ADMIN_PASSWORD, JWT_SECRET } = require('../config');
const Participant = require('../models/Participant');
const Question = require('../models/Question');
const game = require('../game');
const sample = require('../sampleQuestions');
const { parseRoster } = require('../roster');
const { wrap, httpError } = require('../util');

const upload = multer({ limits: { fileSize: 2 * 1024 * 1024 } }); // 2MB is generous for a roster CSV

// ---------- auth ----------
router.post('/login', wrap(async (req, res) => {
  const given = Buffer.from(String(req.body.password || ''));
  const real = Buffer.from(ADMIN_PASSWORD);
  if (given.length !== real.length || !crypto.timingSafeEqual(given, real)) throw httpError(401, 'Wrong password.');
  res.json({ token: jwt.sign({ role: 'admin' }, JWT_SECRET, { expiresIn: '12h' }) });
}));

router.use((req, res, next) => {
  try {
    jwt.verify((req.headers.authorization || '').replace(/^Bearer /, ''), JWT_SECRET);
    next();
  } catch {
    next(httpError(401, 'Admin login required.'));
  }
});

// Roster and questions can only change before the event is live, so nobody's board changes
// under them mid-game. Reset (below) is the one action that is ALWAYS available, in any status.
const needSetup = wrap(async (req, res, next) => {
  const ev = await game.getEvent();
  if (ev.status !== 'setup') throw httpError(409, 'This can only be changed before the event starts. Use Reset if you need to make changes now.');
  next();
});

// ---------- overview ----------
router.get('/overview', wrap(async (req, res) => {
  const ev = await game.getEvent();
  const participants = await Participant.find().sort({ year: 1, name: 1 }).lean();
  const counts = { easy: 0, medium: 0, hard: 0 };
  (await Question.aggregate([{ $group: { _id: '$difficulty', n: { $sum: 1 } } }])).forEach((r) => (counts[r._id] = r.n));
  res.json({
    event: {
      status: ev.status, timerSeconds: ev.timerSeconds, penalty: ev.penalty, violationLimit: ev.violationLimit,
      scheduledStart: ev.scheduledStart, scheduledEnd: ev.scheduledEnd, startedAt: ev.startedAt, endedAt: ev.endedAt,
    },
    questionCounts: counts,
    participants: participants.map((p) => ({
      id: p._id, name: p.name, year: p.year, dept: p.dept, email: p.email, phone: p.phone, regNo: p.regNo, slot: p.slot, active: p.active,
      bound: p.sessionTokens.length, boundAt: p.boundAt, score: p.score, answered: p.answered.length,
      correct: p.answered.filter((a) => a.status === 'correct').length, total: p.grid.length,
      violations: p.violations.length, playing: !!p.current, finished: !!p.finishedAt, lastAccess: p.accessLog[p.accessLog.length - 1] || null,
    })),
  });
}));

router.get('/participants/:id', wrap(async (req, res) => {
  const p = await Participant.findById(req.params.id).lean();
  if (!p) throw httpError(404, 'Participant not found.');
  const qs = await Question.find({ _id: { $in: p.answered.map((a) => a.question) } }).lean();
  const byId = new Map(qs.map((q) => [String(q._id), q]));
  res.json({
    name: p.name, email: p.email, year: p.year, dept: p.dept, phone: p.phone, regNo: p.regNo, slot: p.slot,
    accessLog: p.accessLog.slice().reverse(), violations: p.violations.slice().reverse(),
    answered: p.answered.map((a) => ({ ...a, emoji: byId.get(String(a.question))?.emoji, answer: byId.get(String(a.question))?.answer })).reverse(),
  });
}));

// ---------- roster (imported only, never typed in by hand) ----------
// Accepts either an uploaded CSV file (multipart) or raw CSV/TSV pasted as JSON { csv: "..." }.
router.post('/participants/import', needSetup, upload.single('file'), wrap(async (req, res) => {
  const csv = req.file ? req.file.buffer.toString('utf8') : String(req.body.csv || '');
  if (!csv.trim()) throw httpError(400, 'No file or pasted data received.');
  const { rows, errors } = parseRoster(csv);
  let created = 0;
  let skipped = 0;
  for (const r of rows) {
    try {
      await Participant.create(r);
      created++;
    } catch (e) {
      skipped++;
      errors.push(e.code === 11000 ? `${r.email}: already on the roster, skipped.` : `${r.email}: ${e.message}`);
    }
  }
  res.json({ created, skipped, errors });
}));

router.delete('/participants/:id', needSetup, wrap(async (req, res) => {
  await Participant.deleteOne({ _id: req.params.id });
  res.json({ ok: true });
}));

router.delete('/participants', needSetup, wrap(async (req, res) => {
  await Participant.deleteMany({});
  res.json({ ok: true });
}));

// Access controls stay available even while the event is live (a participant can be helped mid-event).
// Since an email can now be logged in on several devices at once, this signs it out of ALL of them.
router.post('/participants/:id/reset-device', wrap(async (req, res) => {
  await Participant.updateOne({ _id: req.params.id }, { $set: { sessionTokens: [], boundAt: null } });
  game.notifyParticipant(req.params.id);
  res.json({ ok: true });
}));

router.post('/participants/:id/active', wrap(async (req, res) => {
  await Participant.updateOne({ _id: req.params.id }, { $set: { active: !!req.body.active } });
  game.notifyParticipant(req.params.id);
  res.json({ ok: true });
}));

// Roster export, for the admin's own records - not needed for anyone to log in.
// Formats every timestamp in IST (Asia/Kolkata), regardless of what timezone the server runs in.
function istString(d) {
  if (!d) return '';
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Asia/Kolkata', day: '2-digit', month: '2-digit', year: 'numeric',
    hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false,
  }).formatToParts(new Date(d));
  const get = (t) => parts.find((p) => p.type === t)?.value;
  return `${get('day')}-${get('month')}-${get('year')} ${get('hour')}:${get('minute')}:${get('second')} IST`;
}
const LOGIN_RESULTS = new Set(['login-new-device', 'resume']);
function sessionStats(accessLog) {
  const logins = accessLog.filter((a) => LOGIN_RESULTS.has(a.result));
  const logouts = accessLog.filter((a) => a.result === 'logout');
  return {
    loginCount: logins.length,
    logoutCount: logouts.length,
    firstLogin: logins[0]?.at,
    lastLogin: logins[logins.length - 1]?.at,
    lastLogout: logouts[logouts.length - 1]?.at,
  };
}

router.get('/participants/export.csv', wrap(async (req, res) => {
  const participants = await Participant.find().sort({ year: 1, name: 1 }).lean();
  const esc = (s) => `"${String(s ?? '').replace(/"/g, '""')}"`;
  const header = [
    'Name', 'Year', 'Department', 'Register No', 'Slot', 'Email', 'Phone', 'Active',
    'Score', 'Clues Answered', 'Correct', 'Violations', 'Finished',
    'Logins', 'Logouts', 'First Login (IST)', 'Last Login (IST)', 'Last Logout (IST)', 'Last Activity (IST)',
  ].join(',') + '\n';
  const body = participants
    .map((p) => {
      const s = sessionStats(p.accessLog || []);
      return [
        p.name, p.year, p.dept, p.regNo, p.slot, p.email, p.phone, p.active ? 'Yes' : 'No',
        p.score, p.answered.length, p.answered.filter((a) => a.status === 'correct').length, p.violations.length, p.finishedAt ? 'Yes' : 'No',
        s.loginCount, s.logoutCount, istString(s.firstLogin), istString(s.lastLogin), istString(s.lastLogout), istString(p.updatedAt),
      ].map(esc).join(',');
    })
    .join('\n');
  // A UTF-8 BOM prefix is what makes Excel (as opposed to a plain text editor) recognise this as
  // UTF-8 CSV instead of guessing a different encoding and mangling names with accents/emoji.
  const csv = '\uFEFF' + header + body;
  res.set('Content-Type', 'text/csv; charset=utf-8');
  res.set('Content-Disposition', `attachment; filename="participants-${new Date().toISOString().slice(0, 10)}.csv"`);
  res.send(csv);
}));

// ---------- questions ----------
function cleanQuestion(b) {
  const points = Number(b.points);
  if (!Number.isFinite(points) || points < 1 || points > 1000) throw httpError(400, 'Points must be a number between 1 and 1000.');
  return {
    emoji: String(b.emoji || '').trim(),
    clue: String(b.clue || '').trim(),
    options: (Array.isArray(b.options) ? b.options : []).map((o) => String(o).trim()).filter(Boolean),
    answer: String(b.answer || '').trim(),
    difficulty: b.difficulty,
    points: Math.round(points),
  };
}

router.get('/questions', wrap(async (req, res) => {
  res.json(await Question.find().sort({ difficulty: 1, createdAt: 1 }).lean());
}));
router.post('/questions', needSetup, wrap(async (req, res) => res.json(await Question.create(cleanQuestion(req.body)))));
router.put('/questions/:id', needSetup, wrap(async (req, res) => {
  const q = await Question.findById(req.params.id);
  if (!q) throw httpError(404, 'Question not found.');
  q.set(cleanQuestion(req.body));
  res.json(await q.save());
}));
router.delete('/questions/:id', needSetup, wrap(async (req, res) => {
  await Question.deleteOne({ _id: req.params.id });
  res.json({ ok: true });
}));
router.post('/questions/load-sample', needSetup, wrap(async (req, res) => {
  if (await Question.countDocuments()) throw httpError(409, 'Questions already exist - delete them first or add more by hand.');
  await Question.insertMany(sample);
  res.json({ added: sample.length });
}));

// ---------- event ----------
router.post('/event/settings', needSetup, wrap(async (req, res) => {
  const ev = await game.getEvent();
  const t = Number(req.body.timerSeconds);
  if (!Number.isFinite(t) || t < 10 || t > 60) throw httpError(400, 'Timer must be between 10 and 60 seconds.');
  ev.timerSeconds = Math.round(t);
  ev.penalty = req.body.penalty === 'log' ? 'log' : 'lock';
  if (req.body.violationLimit !== undefined) {
    const v = Number(req.body.violationLimit);
    if (!Number.isFinite(v) || v < 0) throw httpError(400, 'Violation limit must be 0 or more.');
    ev.violationLimit = Math.round(v);
  }
  // Optional schedule: leave either blank to require the matching manual button instead.
  ev.scheduledStart = req.body.scheduledStart ? new Date(req.body.scheduledStart) : null;
  ev.scheduledEnd = req.body.scheduledEnd ? new Date(req.body.scheduledEnd) : null;
  await ev.save();
  res.json({ ok: true });
}));
router.post('/event/start', wrap(async (req, res) => { await game.startEvent(); res.json({ ok: true }); }));
router.post('/event/end', wrap(async (req, res) => { await game.endEvent(); res.json({ ok: true }); }));

// Reset is always available, whatever the current status - an ended event is never permanently locked.
// scope: 'runs' (default) keeps roster + questions, 'roster' also clears participants, 'all' clears everything.
router.post('/event/reset', wrap(async (req, res) => {
  const scope = ['runs', 'roster', 'all'].includes(req.body.scope) ? req.body.scope : 'runs';
  await game.resetEvent(scope);
  res.json({ ok: true });
}));

// Winners: admin only, and only once the event has ended.
router.get('/results', wrap(async (req, res) => {
  const ev = await game.getEvent();
  if (ev.status !== 'ended') throw httpError(403, 'Winners are finalized when the event ends.');
  res.json({ endedAt: ev.endedAt, winners: ev.winners, standings: ev.standings, violationLimit: ev.violationLimit });
}));

module.exports = router;
