const router = require('express').Router();
const game = require('../game');
const { wrap } = require('../util');

// Live scoreboard for everyone. Returns rows: null once the event has ended (winners are admin-only).
router.get('/scoreboard', wrap(async (req, res) => res.json(await game.publicScoreboard())));

module.exports = router;
