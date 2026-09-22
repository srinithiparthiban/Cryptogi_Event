const config = require('./config');
const os = require('os');
const fs = require('fs');
const path = require('path');
const http = require('http');
const express = require('express');
const cors = require('cors');
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
app.use(cors({ origin: true }));
app.use(express.json({ limit: '1mb' })); // roster CSV pasted as JSON can be a bit larger than the old 100kb cap
app.use('/api/admin', require('./routes/admin'));
app.use('/api/participant', require('./routes/participant'));
app.use('/api/public', require('./routes/public'));
app.use('/api', (req, res) => res.status(404).json({ error: 'Not found' }));

// Serve the built React app so the whole event runs from one address (npm run build in client/ first).
const dist = path.join(__dirname, '../../client/dist');
if (fs.existsSync(dist)) {
  app.use(express.static(dist));
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
    const p = await Participant.findOne({ sessionToken: a.token, active: true }, '_id').catch(() => null);
    if (p) { socket.join(`p:${p._id}`); socket.join('scoreboard'); }
  }
  if (a.scoreboard) socket.join('scoreboard');
  next();
});

// Backup for the schedule check: even with nobody hitting the API right at the scheduled
// moment, this makes sure a scheduled start/end still fires on time.
setInterval(() => { game.getEvent().catch(() => {}); }, 10_000);

mongoose
  .connect(config.MONGO_URI)
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
