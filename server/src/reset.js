// npm run reset                 -> clears play data + event, keeps roster and questions
// npm run reset -- --roster     -> also clears the participant roster
// npm run reset -- --all        -> clears roster and questions too
// This is a convenience for the terminal. The same reset is available from the admin page
// at any time - in any event status - as the "Reset event" button.
const config = require('./config');
const mongoose = require('mongoose');

(async () => {
  await mongoose.connect(config.MONGO_URI);
  const game = require('./game');
  const scope = process.argv.includes('--all') ? 'all' : process.argv.includes('--roster') ? 'roster' : 'runs';
  await game.resetEvent(scope);
  console.log('Reset done.', { runs: '(roster + questions kept)', roster: '(questions kept, roster cleared)', all: '(everything cleared)' }[scope]);
  await mongoose.disconnect();
  process.exit(0);
})().catch((e) => { console.error(e.message); process.exit(1); });
