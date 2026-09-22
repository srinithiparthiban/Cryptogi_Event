// All game rules live here. The server is the only authority on time, points and order.
const crypto = require('crypto');
const Event = require('./models/Event');
const Participant = require('./models/Participant');
const Question = require('./models/Question');
const { httpError, shuffle, hashStr } = require('./util');

const TIERS = ['easy', 'medium', 'hard'];
const GRACE_MS = 700; // network allowance for an answer sent exactly as the timer hits zero

let io = null;
const timers = new Map();
const setIO = (server) => (io = server);

async function getEvent() {
  let ev = await Event.findOne({ key: 'main' });
  if (!ev) {
    try {
      ev = await Event.create({ key: 'main' });
    } catch {
      ev = await Event.findOne({ key: 'main' }); // another request created it first
    }
  }
  return maybeAutoTransition(ev);
}

// Flips status based on the stored schedule and the server clock — not on memory, not on who
// happens to make a request. This is what lets the event resume correctly after any interruption
// (server restart, lost connection, admin's laptop closing) without anyone touching the admin page.
// Many participants can poll at once right at the scheduled boundary; this lock makes sure only
// one of those concurrent calls actually runs the transition instead of racing each other.
let transitionLock = null;
async function maybeAutoTransition(ev) {
  const now = Date.now();
  const needsStart = ev.status === 'setup' && ev.scheduledStart && now >= +ev.scheduledStart;
  const needsEnd = ev.status === 'live' && ev.scheduledEnd && now >= +ev.scheduledEnd;
  if (!needsStart && !needsEnd) return ev;
  if (transitionLock) return transitionLock;
  transitionLock = (async () => {
    try {
      const fresh = (await Event.findOne({ key: 'main' })) || ev; // re-check in case another request already flipped it
      if (fresh.status === 'setup' && fresh.scheduledStart && Date.now() >= +fresh.scheduledStart) {
        try {
          return await startEvent(fresh);
        } catch {
          return fresh; // e.g. no participants/questions yet - stays in setup, admin will see why
        }
      }
      if (fresh.status === 'live' && fresh.scheduledEnd && Date.now() >= +fresh.scheduledEnd) {
        return await endEvent(fresh);
      }
      return fresh;
    } finally {
      transitionLock = null;
    }
  })();
  return transitionLock;
}

// ---------- ranking ----------
// Primary sort key is score; time/violations/name only break ties within equal score so that
// participants who are truly tied on points share the same rank ("1, 1, 3" not "1, 2, 3").
function statsFor(p) {
  return {
    id: p._id,
    name: p.name,
    year: p.year,
    dept: p.dept,
    email: p.email,
    score: p.score,
    correct: p.answered.filter((a) => a.status === 'correct').length,
    answered: p.answered.length,
    timeMs: p.totalTimeMs,
    violations: p.violations.length,
  };
}
const tieBreak = (a, b) => a.timeMs - b.timeMs || a.violations - b.violations || a.name.localeCompare(b.name);

async function rankedParticipants() {
  const list = await Participant.find().lean();
  return list.map(statsFor).sort((a, b) => b.score - a.score || tieBreak(a, b));
}

// Competition ranking (1,1,3 not 1,2,3): a tied score keeps the previous rank, everyone else
// gets their 1-based position. Builds the output incrementally so each row can look at the
// rank just assigned to the row before it, not at the unranked input.
function assignRanks(sortedByScoreDesc) {
  const out = [];
  sortedByScoreDesc.forEach((r, i) => {
    const rank = i === 0 ? 1 : out[i - 1].score === r.score ? out[i - 1].rank : i + 1;
    out.push({ ...r, rank });
  });
  return out;
}

// What everybody may see while the event is live. Never used after the event ends.
async function publicScoreboard() {
  const ev = await getEvent();
  if (ev.status === 'ended') return { status: 'ended', rows: null };
  if (ev.status === 'setup') return { status: 'setup', rows: [] };
  const rows = assignRanks(await rankedParticipants()).map(({ rank, name, year, score, answered }) => ({ rank, name, year, score, answered }));
  return { status: 'live', rows };
}

// ---------- realtime fan-out (throttled) ----------
let pending = false;
function scheduleBroadcast() {
  if (!io || pending) return;
  pending = true;
  setTimeout(async () => {
    pending = false;
    try {
      const sb = await publicScoreboard();
      if (sb.status === 'live') io.to('scoreboard').emit('scoreboard', sb);
      io.to('admin').emit('admin:refresh');
    } catch (e) {
      console.error('broadcast failed', e.message);
    }
  }, 300);
}
function notifyParticipant(id) {
  if (io) io.to(`p:${id}`).emit('participant:update');
  scheduleBroadcast();
}
function announceStatus(status) {
  if (!io) return;
  io.emit('event:status', { status });
  if (status === 'ended') io.to('scoreboard').emit('scoreboard', { status: 'ended', rows: null });
  scheduleBroadcast();
}

// ---------- clue lifecycle ----------
function scheduleExpiry(participantId, endsAt) {
  clearTimeout(timers.get(String(participantId)));
  const wait = Math.max(0, new Date(endsAt).getTime() - Date.now()) + GRACE_MS + 150;
  timers.set(
    String(participantId),
    setTimeout(async () => {
      timers.delete(String(participantId));
      try {
        await loadFresh(participantId);
      } catch (e) {
        console.error('expiry failed', e.message);
      }
    }, wait)
  );
}

// Closes the active clue exactly once (the filter on current.question makes double-closing impossible).
async function finishCurrent(participantId, status, chosen = null) {
  const p = await Participant.findById(participantId);
  if (!p || !p.current) return null;
  const q = await Question.findById(p.current.question);
  const points = q.points;
  const limit = p.current.endsAt - p.current.startedAt;
  const elapsed = Math.min(Date.now() - p.current.startedAt, limit);
  const final = status === 'answer' ? (chosen === q.answer ? 'correct' : 'wrong') : status;
  const earned = final === 'correct' ? points : 0;
  const updated = await Participant.findOneAndUpdate(
    { _id: participantId, 'current.question': p.current.question },
    {
      $set: { current: null },
      $push: { answered: { question: q._id, points, earned, status: final, chosen, timeMs: elapsed, at: new Date() } },
      $inc: { score: earned, totalTimeMs: final === 'correct' ? elapsed : 0 },
    },
    { new: true }
  );
  if (updated) {
    clearTimeout(timers.get(String(participantId)));
    timers.delete(String(participantId));
    notifyParticipant(participantId);
  }
  return updated;
}

// Loads a participant and, if their clue ran out of time, closes it as a timeout first.
async function loadFresh(id) {
  let p = await Participant.findById(id);
  if (p && p.current && Date.now() > p.current.endsAt.getTime() + GRACE_MS) {
    await finishCurrent(id, 'timeout');
    p = await Participant.findById(id);
  }
  return p;
}

async function recoverTimers() {
  const list = await Participant.find({ current: { $ne: null } }, '_id current');
  list.forEach((p) => scheduleExpiry(p._id, p.current.endsAt));
}

// ---------- what a participant is allowed to see ----------
function optionsFor(p, q) {
  return shuffle(q.options, (p.seed ^ hashStr(String(q._id))) >>> 0);
}

async function participantState(p, ev) {
  ev = ev || (await getEvent());
  if (ev.status === 'ended') return { serverNow: Date.now(), event: { status: 'ended' }, participant: { name: p.name } };
  const base = {
    serverNow: Date.now(),
    event: { status: ev.status, timerSeconds: ev.timerSeconds, scheduledStart: ev.scheduledStart, scheduledEnd: ev.scheduledEnd },
    participant: { name: p.name, year: p.year },
  };
  base.participant.score = p.score;
  base.participant.answered = p.answered.length;
  base.participant.total = p.grid.length;
  base.participant.finished = !!p.finishedAt;
  if (ev.status === 'setup') return base;

  const done = new Map(p.answered.map((a) => [String(a.question), a.status]));
  const cur = p.current ? String(p.current.question) : null;
  base.grid = p.grid.map((c) => {
    const id = String(c.question);
    return { id, tier: c.tier, points: c.points, status: done.get(id) || (id === cur ? 'active' : 'open') };
  });
  if (p.current) {
    const q = await Question.findById(p.current.question).lean();
    base.active = {
      id: cur,
      emoji: q.emoji,
      clue: q.clue,
      points: q.points,
      options: optionsFor(p, q), // the correct answer is never sent
      startedAt: +p.current.startedAt,
      endsAt: +p.current.endsAt,
    };
  }
  return base;
}

// ---------- participant actions ----------
async function selectClue(participantId, qid) {
  const ev = await getEvent();
  if (ev.status !== 'live') throw httpError(409, 'The event is not live.');
  const p = await loadFresh(participantId);
  if (p.current) throw httpError(409, 'Finish your current clue first.');
  if (!p.grid.some((c) => String(c.question) === String(qid))) throw httpError(404, 'That clue is not on your board.');
  if (p.answered.some((a) => String(a.question) === String(qid))) throw httpError(409, 'You already attempted that clue.');

  const now = new Date();
  const ends = new Date(now.getTime() + ev.timerSeconds * 1000);
  const updated = await Participant.findOneAndUpdate(
    { _id: participantId, current: null, 'answered.question': { $ne: qid } },
    { $set: { current: { question: qid, startedAt: now, endsAt: ends } } },
    { new: true }
  );
  if (!updated) throw httpError(409, 'Could not start that clue.');
  scheduleExpiry(participantId, ends);
  notifyParticipant(participantId);
  return participantState(updated, ev);
}

async function submitAnswer(participantId, chosen) {
  const ev = await getEvent();
  if (ev.status !== 'live') throw httpError(409, 'The event is not live.');
  const p = await loadFresh(participantId);
  if (!p.current) throw httpError(409, 'Time was up - that clue is closed.');
  const q = await Question.findById(p.current.question);
  if (typeof chosen !== 'string' || !q.options.includes(chosen)) throw httpError(400, 'Pick one of the options.');
  await finishCurrent(participantId, 'answer', chosen);
  return participantState(await Participant.findById(participantId), ev);
}

// A participant explicitly submits once their board is complete. This releases them from the
// anti-cheat watchers (their screen no longer needs to stay open or be monitored) and gives them
// a clear "you're done" moment instead of being left on an empty board until the event ends.
async function finishParticipant(participantId) {
  const ev = await getEvent();
  if (ev.status !== 'live') throw httpError(409, 'The event is not live.');
  const p = await loadFresh(participantId);
  if (p.current) throw httpError(409, 'Finish your current clue first.');
  if (p.answered.length < p.grid.length) throw httpError(409, 'You still have clues left to attempt.');
  if (p.finishedAt) return participantState(p, ev); // already submitted, idempotent
  const updated = await Participant.findOneAndUpdate(
    { _id: participantId, finishedAt: null },
    { $set: { finishedAt: new Date() } },
    { new: true }
  );
  notifyParticipant(participantId);
  return participantState(updated || p, ev);
}

// Violations are never surfaced back to the participant beyond a generic "locked" message -
// no count, no reason detail - only the admin panel shows them.
async function recordViolation(participantId, kind) {
  const KNOWN = new Set(['tab-hidden', 'window-blur', 'fullscreen-exit', 'copy-paste', 'context-menu']);
  if (!KNOWN.has(kind)) throw httpError(400, 'Unknown violation type.');
  const ev = await getEvent();
  if (ev.status !== 'live') return { ignored: true };
  const p = await Participant.findById(participantId);
  if (p.finishedAt) return { ignored: true }; // submitted - no longer being monitored
  const last = p.violations[p.violations.length - 1];
  if (last && last.kind === kind && Date.now() - last.at < 1500) return { ignored: true };
  const penalized = !!p.current && ev.penalty === 'lock';
  await Participant.updateOne(
    { _id: participantId },
    { $push: { violations: { kind, at: new Date(), question: p.current ? p.current.question : null, penalized } } }
  );
  if (penalized) await finishCurrent(participantId, 'penalty');
  else notifyParticipant(participantId);
  return { penalized };
}

// ---------- admin actions ----------
// Accepts an already-loaded event doc to avoid re-fetching when called from maybeAutoTransition.
async function startEvent(evIn) {
  const ev = evIn || (await Event.findOne({ key: 'main' }));
  if (ev.status !== 'setup') throw httpError(409, 'The event has already started.');
  const [participants, questions] = await Promise.all([Participant.find(), Question.find()]);
  if (!participants.length) throw httpError(400, 'Import participants first.');
  if (!questions.length) throw httpError(400, 'Add at least one question first.');

  const byTier = { easy: [], medium: [], hard: [] };
  questions.forEach((q) => byTier[q.difficulty].push(q));

  // Every participant gets their own random order inside each tier, so neighbours cannot compare boards.
  await Participant.bulkWrite(
    participants.map((p) => {
      const seed = crypto.randomInt(1, 2 ** 31 - 1);
      const grid = [];
      for (const tier of TIERS) shuffle(byTier[tier], seed + hashStr(tier)).forEach((q) => grid.push({ question: q._id, tier, points: q.points }));
      return { updateOne: { filter: { _id: p._id }, update: { $set: { seed, grid, current: null, answered: [], score: 0, totalTimeMs: 0, violations: [], finishedAt: null } } } };
    })
  );
  ev.status = 'live';
  ev.startedAt = new Date();
  await ev.save();
  announceStatus('live');
  return ev;
}

// Finalizes results once. Winners are stored on the event and only ever served by admin routes.
// Eligibility: a participant with more than the violation limit is excluded from winners (but
// still appears in the full standings the admin sees, flagged as ineligible).
async function endEvent(evIn) {
  const ev = evIn || (await Event.findOne({ key: 'main' }));
  if (ev.status !== 'live') throw httpError(409, 'The event is not live.');
  const active = await Participant.find({ current: { $ne: null } }, '_id');
  for (const p of active) await finishCurrent(p._id, 'timeout');

  const sorted = (await rankedParticipants()).sort((a, b) => b.score - a.score || tieBreak(a, b));
  const standings = assignRanks(sorted).map((r) => ({ ...r, eligible: r.violations <= ev.violationLimit }));
  const eligible = assignRanks(sorted.filter((r) => r.violations <= ev.violationLimit));
  const winners = eligible.filter((r) => r.rank <= 3);

  const done = await Event.findOneAndUpdate(
    { key: 'main', status: 'live' },
    { $set: { status: 'ended', endedAt: new Date(), standings, winners } },
    { new: true }
  );
  if (!done) throw httpError(409, 'The event is not live.');
  announceStatus('ended');
  return done;
}

// Resets the event so it can run again. Always available, in any status — an ended event is
// never permanently locked. `wipe`: 'runs' keeps the roster and questions, only clears play
// data and event state; 'roster' also clears participants; 'all' clears everything.
async function resetEvent(wipe = 'runs') {
  const ops = [
    Participant.updateMany({}, { $set: { current: null, answered: [], score: 0, totalTimeMs: 0, violations: [], sessionToken: null, boundAt: null, finishedAt: null }, $unset: { seed: '', grid: '' } }),
    Event.deleteMany({}),
  ];
  if (wipe === 'roster' || wipe === 'all') ops[0] = Participant.deleteMany({});
  if (wipe === 'all') ops.push(Question.deleteMany({}));
  timers.forEach((t) => clearTimeout(t));
  timers.clear();
  await Promise.all(ops);
  await getEvent(); // recreate the 'main' event doc in a clean 'setup' state
  announceStatus('setup');
}

module.exports = {
  GRACE_MS, TIERS, setIO, getEvent, publicScoreboard, participantState, selectClue, submitAnswer,
  finishParticipant, recordViolation, startEvent, endEvent, resetEvent, recoverTimers, notifyParticipant, scheduleBroadcast, announceStatus,
};
