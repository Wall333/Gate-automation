require('dotenv').config();
const express = require('express');
const cors = require('cors');
const http = require('http');
const seedAdmin = require('./seed');
const { initDeviceWebSocket, initAppWebSocket, recoverOpenTooLongTimers } = require('./lib/deviceManager');

const app = express();
const server = http.createServer(app);

// ── Reverse proxy trust (Caddy sends X-Forwarded-For) ────
app.set('trust proxy', 1);

// ── Middleware ────────────────────────────────────────────
app.use(cors());
app.use(express.json());

// ── Routes ───────────────────────────────────────────────
const authRoutes           = require('./routes/auth');
const adminRoutes          = require('./routes/admin');
const gateRoutes           = require('./routes/gate');
const firmwareRoutes       = require('./routes/firmware');
const eventsRoutes         = require('./routes/events');
const notificationsRoutes  = require('./routes/notifications');
app.use('/auth',  authRoutes);
app.use('/admin', adminRoutes);
app.use('/gate',  gateRoutes);
app.use('/',      firmwareRoutes);  // Mounts /admin/firmware + /firmware/download
app.use('/gate',  eventsRoutes);    // Mounts /gate/events
app.use('/user',  notificationsRoutes);  // Mounts /user/notification-preferences + /user/push-token

// ── Health check ─────────────────────────────────────────
app.get('/health', (_req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// ── Start ────────────────────────────────────────────────
const PORT = process.env.PORT || 3000;

server.listen(PORT, async () => {
  console.log(`[server] listening on http://localhost:${PORT}`);
  await seedAdmin();
  initDeviceWebSocket(server);
  initAppWebSocket(server);
  await recoverOpenTooLongTimers();
});
