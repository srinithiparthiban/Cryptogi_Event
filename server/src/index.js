const config = require('./config');
const os = require('os');
const fs = require('fs');
const path = require('path');
const http = require('http');
const express = require('express');
const cors = require('cors');
const compression = require('compression');
const mongoose = require('mongoose');
const jwt = require('jsonwebtoken');
const { Server } = require('socket.io');
const Participant = require('./models/Participant');
const game = require('./game');

const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: true } });
game.setIO(io);

app.set('trust proxy', true); // needed behind Render/Railway/any reverse proxy so req.ip is the real client IP
app.use(compression()); // gzip every response - the scoreboard/state JSON and the built JS bundle shrink a lot, which matters most on the congested wifi 100+ phones share at a live event
app.use(cors({ origin: true }));
app.use(express.json({ limit: '1mb' })); // roster CSV pasted as JSON can be a bit larger than the old 100kb cap
app.use('/api/admin', require('./routes/admin'));
app.use('/api/participant', require('./routes/participant'));
app.use('/api/public', require('./routes/public'));
app.use('/api', (req, res) => res.status(404).json({ error: 'Not found' }));

// Serve the built React app so the whole event runs from one address (npm run build in client/ first).
// maxAge on the hashed JS/CSS bundle lets browsers cache it instead of re-downloading it from this
// one server on every page load - the difference between one request per device and one request
// per device *per navigation* when 100+ phones are hitting the same small server.
const dist = path.join(__dirname, '../../client/dist');
if (fs.existsSync(dist)) {
  app.use(express.static(dist, { maxAge: '1y', index: false }));
  app.get(/^(?!\/api|\/socket\.io).*/, (req, res) => res.sendFile(path.join(dist, 'index.html')));
}

app.use((err, req, res, next) => {
  let status = err.status || 500;
  let message = err.message || 'Server error';
  if (err.name === 'ValidationError' || err.name === 'CastError') status = 400;
  if (err.code === 11000) { status = 409; message = 'That email is already on the roster.'; }
  if (err.name === 'MulterError') { status = 400; message = 'Upload error: ' + err.message; }
  if (status === 500) console.error(err);
  res.status(status).json({ error: message });
});

// Socket rooms: admin, scoreboard (everyone), p:<id> (private updates for one participant)
io.use(async (socket, next) => {
  const a = socket.handshake.auth || {};
  if (a.adminToken) {
    try { jwt.verify(a.adminToken, config.JWT_SECRET); socket.join('admin'); } catch { /* not admin */ }
  }
  if (a.token) {
    const p = await Participant.findOne({ sessionTokens: a.token, active: true }, '_id').catch(() => null);
    // Participants are no longer put in the 'scoreboard' room - the leaderboard is admin-only
    // now, so there is nothing to fan out to them, and it saves a broadcast target per participant.
    if (p) { socket.join(`p:${p._id}`); socket.data.participantId = p._id; }
  }
  if (a.scoreboard) socket.join('scoreboard'); // the separate /scoreboard projector page opts in explicitly
  next();
});

// A participant's socket disconnecting (tab closed, app switched, wifi dropped) is the closest
// thing this app has to a "logout" - there's no explicit logout button - so it's logged with a
// timestamp the same way a login is, for the roster export.
io.on('connection', (socket) => {
  socket.on('disconnect', () => {
    if (socket.data.participantId) {
      game.recordLogout(socket.data.participantId, socket.handshake.address, socket.handshake.headers['user-agent']);
    }
  });
});

// Backup for the schedule check: even with nobody hitting the API right at the scheduled
// moment, this makes sure a scheduled start/end still fires on time.
setInterval(() => { game.getEvent().catch(() => {}); }, 10_000);

mongoose
  // maxPoolSize: with 100+ participants hammering the API at once, the default pool (100) can
  // queue up under a burst; serverSelectionTimeoutMS makes a request fail fast with a clear error
  // instead of hanging the connection (which is what produced the blank page under load).
  .connect(config.MONGO_URI, { maxPoolSize: 150, minPoolSize: 5, serverSelectionTimeoutMS: 8000, socketTimeoutMS: 20000 })
  .then(async () => {
    await game.recoverTimers();
    await game.getEvent(); // apply any schedule transition missed while the server was down
    server.listen(config.PORT, '0.0.0.0', () => {
      console.log(`\nEvent server ready on port ${config.PORT}`);
      const ips = Object.values(os.networkInterfaces()).flat().filter((i) => i.family === 'IPv4' && !i.internal).map((i) => i.address);
      console.log(fs.existsSync(dist) ? 'Open on this machine:  http://localhost:' + config.PORT : 'Client not built - use the Vite dev server (see README).');
      ips.forEach((ip) => console.log('Other devices on your network:  http://' + ip + ':' + config.PORT));
    });
  })
  .catch((e) => {
    console.error('\nCould not connect to MongoDB at the configured MONGO_URI.\n', e.message, '\nCheck your Atlas connection string and that your IP is allowed in Atlas Network Access.\n');
    process.exit(1);
  });
