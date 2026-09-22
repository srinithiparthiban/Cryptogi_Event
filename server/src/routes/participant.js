/*
const router = require('express').Router();
const Participant = require('../models/Participant');
const game = require('../game');
const { wrap, httpError, normEmail, genToken } = require('../util');

const MAX_LOG = 100;
const logAccess = (id, req, result) =>
  Participant.updateOne(
    { _id: id },
    { $push: { accessLog: { $each: [{ at: new Date(), ip: req.ip, ua: String(req.headers['user-agent'] || '').slice(0, 160), result }], $slice: -MAX_LOG } } }
  );

// A registered email can only be bound to ONE browser/device at a time. The same email opening
// the shared link on a second device is refused until admin resets that device.
router.post('/login', wrap(async (req, res) => {
  const email = normEmail(req.body.email);
  if (!email || !email.includes('@')) throw httpError(400, 'Enter a valid email address.');
  const p = await Participant.findOne({ email });
  if (!p) throw httpError(404, 'This email is not registered for the event. Check what you used on the sign-up form.');
  if (!p.active) {
    await logAccess(p._id, req, 'blocked-disabled');
    throw httpError(403, 'Your entry has been disabled by the organizer.');
  }
  const saved = String(req.body.token || '');
  if (p.sessionToken) {
    if (saved && saved === p.sessionToken) {
      await logAccess(p._id, req, 'resume');
      return res.json({ token: p.sessionToken, name: p.name });
    }
    await logAccess(p._id, req, 'denied-already-in-use');
    throw httpError(409, 'This email is already in use on another device. Ask the organizer to reset your device if that was you.');
  }
  const token = genToken();
  const bound = await Participant.findOneAndUpdate({ _id: p._id, sessionToken: null }, { $set: { sessionToken: token, boundAt: new Date() } }, { new: true });
  if (!bound) throw httpError(409, 'This email is already in use on another device.');
  await logAccess(p._id, req, 'first-login');
  game.scheduleBroadcast();
  res.json({ token, name: p.name });
}));

const auth = wrap(async (req, res, next) => {
  const p = await Participant.findOne({ sessionToken: String(req.headers['x-participant-token'] || '__none__') });
  if (!p) throw httpError(401, 'Your session is no longer valid. Go back and log in again.');
  if (!p.active) throw httpError(403, 'Your entry has been disabled by the organizer.');
  req.participant = p;
  next();
});
router.use(auth);

router.get('/state', wrap(async (req, res) => {
  const fresh = (await Participant.findById(req.participant._id)) || req.participant;
  res.json(await game.participantState(fresh));
}));

router.post('/select', wrap(async (req, res) => res.json(await game.selectClue(req.participant._id, req.body.id))));
router.post('/answer', wrap(async (req, res) => res.json(await game.submitAnswer(req.participant._id, req.body.chosen))));
router.post('/finish', wrap(async (req, res) => res.json(await game.finishParticipant(req.participant._id))));
router.post('/violation', wrap(async (req, res) => res.json(await game.recordViolation(req.participant._id, String(req.body.kind)))));

module.exports = router;
*/
const router = require('express').Router();
const Participant = require('../models/Participant');
const game = require('../game');
const { wrap, httpError, normEmail, genToken } = require('../util');

const MAX_LOG = 100;
const logAccess = (id, req, result) =>
  Participant.updateOne(
    { _id: id },
    { $push: { accessLog: { $each: [{ at: new Date(), ip: req.ip, ua: String(req.headers['user-agent'] || '').slice(0, 160), result }], $slice: -MAX_LOG } } }
  );

const MAX_DEVICES = 20; // per email - a generous cap just to stop the array growing without bound

// A registered email can log in from more than one device at once (labs, phone + laptop, a
// retry after a crash). Each login gets its own token; the token list is capped so it can't
// grow forever if someone keeps logging in from new devices/browsers.
router.post('/login', wrap(async (req, res) => {
  const email = normEmail(req.body.email);
  if (!email || !email.includes('@')) throw httpError(400, 'Enter a valid email address.');
  const p = await Participant.findOne({ email });
  if (!p) throw httpError(404, 'This email is not registered for the event. Check what you used on the sign-up form.');
  if (!p.active) {
    await logAccess(p._id, req, 'blocked-disabled');
    throw httpError(403, 'Your entry has been disabled by the organizer.');
  }
  const saved = String(req.body.token || '');
  if (saved && p.sessionTokens.includes(saved)) {
    await logAccess(p._id, req, 'resume');
    return res.json({ token: saved, name: p.name });
  }
  // One atomic write instead of two separate round trips: at 100+ simultaneous fresh logins,
  // this halves the database calls this route makes for the common case (a brand-new device).
  const token = genToken();
  const entry = { at: new Date(), ip: req.ip, ua: String(req.headers['user-agent'] || '').slice(0, 160), result: 'login-new-device' };
  await Participant.updateOne(
    { _id: p._id },
    {
      $set: { boundAt: new Date() },
      $push: {
        sessionTokens: { $each: [token], $slice: -MAX_DEVICES },
        accessLog: { $each: [entry], $slice: -MAX_LOG },
      },
    }
  );
  game.scheduleBroadcast();
  res.json({ token, name: p.name });
}));

const auth = wrap(async (req, res, next) => {
  const p = await Participant.findOne({ sessionTokens: String(req.headers['x-participant-token'] || '__none__') });
  if (!p) throw httpError(401, 'Your session is no longer valid. Go back and log in again.');
  if (!p.active) throw httpError(403, 'Your entry has been disabled by the organizer.');
  req.participant = p;
  next();
});
router.use(auth);

router.get('/state', wrap(async (req, res) => {
  const fresh = (await Participant.findById(req.participant._id)) || req.participant;
  res.json(await game.participantState(fresh));
}));

router.post('/select', wrap(async (req, res) => res.json(await game.selectClue(req.participant._id, req.body.id))));
router.post('/answer', wrap(async (req, res) => res.json(await game.submitAnswer(req.participant._id, req.body.chosen))));
router.post('/finish', wrap(async (req, res) => res.json(await game.finishParticipant(req.participant._id))));
router.post('/violation', wrap(async (req, res) => res.json(await game.recordViolation(req.participant._id, String(req.body.kind)))));

module.exports = router;
