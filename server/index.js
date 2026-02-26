require('dotenv').config();
const express = require('express');
const cors = require('cors');
const http = require('http');
const seedAdmin = require('./seed');
const { initDeviceWebSocket } = require('./lib/deviceManager');

const app = express();
const server = http.createServer(app);

// ── Middleware ────────────────────────────────────────────
app.use(cors());
app.use(express.json());

// ── Routes ───────────────────────────────────────────────
const authRoutes  = require('./routes/auth');
const adminRoutes = require('./routes/admin');
const gateRoutes  = require('./routes/gate');
app.use('/auth',  authRoutes);
app.use('/admin', adminRoutes);
app.use('/gate',  gateRoutes);

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
});
