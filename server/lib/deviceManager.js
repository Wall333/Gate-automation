const { WebSocketServer } = require('ws');
const bcrypt = require('bcryptjs');
const prisma = require('./prisma');

// ── State ────────────────────────────────────────────────
// Map of deviceId → WebSocket connection (device connections)
const connectedDevices = new Map();

// Set of WebSocket connections from mobile/web app clients
const appClients = new Set();

// How long before we consider a device offline (ms)
const OFFLINE_THRESHOLD_MS = 90 * 1000;

// ── WebSocket servers (noServer mode for multi-path routing) ────
let deviceWss = null;
let appWss = null;

// ── Initialise WebSocket server on existing HTTP server ──
function initDeviceWebSocket(httpServer) {
  deviceWss = new WebSocketServer({
    noServer: true,
    perMessageDeflate: true, // Accept RSV1 (compressed) frames from Arduino
  });

  console.log('[ws] Device WebSocket server ready on /device/ws');

  deviceWss.on('connection', (ws) => {
    let authenticatedDeviceId = null;
    let heartbeatTimer = null;

    // Give the device 10 seconds to authenticate
    const authTimeout = setTimeout(() => {
      if (!authenticatedDeviceId) {
        ws.close(4001, 'Authentication timeout');
      }
    }, 10_000);

    ws.on('message', async (raw) => {
      let msg;
      try {
        msg = JSON.parse(raw.toString());
      } catch {
        ws.send(JSON.stringify({ type: 'ERROR', message: 'Invalid JSON' }));
        return;
      }

      // ── AUTH message (must be first) ─────────────────
      if (msg.type === 'AUTH') {
        try {
          const device = await authenticateDevice(msg.token);
          if (!device) {
            ws.send(JSON.stringify({ type: 'AUTH_FAILED', message: 'Invalid device token' }));
            ws.close(4003, 'Invalid device token');
            return;
          }

          authenticatedDeviceId = device.id;
          clearTimeout(authTimeout);

          // Register connection
          connectedDevices.set(device.id, ws);

          // Mark device online
          await prisma.device.update({
            where: { id: device.id },
            data: { isOnline: true, lastSeen: new Date() },
          });

          ws.send(JSON.stringify({ type: 'AUTHENTICATED', deviceId: device.id }));
          console.log(`[ws] Device "${device.name}" (${device.id}) connected`);

          // Start offline check timer
          heartbeatTimer = startHeartbeatMonitor(device.id, ws);
        } catch (err) {
          console.error('[ws] AUTH error:', err);
          ws.send(JSON.stringify({ type: 'ERROR', message: 'Auth error' }));
        }
        return;
      }

      // ── All other messages require authentication ────
      if (!authenticatedDeviceId) {
        ws.send(JSON.stringify({ type: 'ERROR', message: 'Not authenticated' }));
        return;
      }

      // ── HEARTBEAT ────────────────────────────────────
      if (msg.type === 'HEARTBEAT') {
        await prisma.device.update({
          where: { id: authenticatedDeviceId },
          data: { isOnline: true, lastSeen: new Date() },
        });
        ws.send(JSON.stringify({ type: 'PONG' }));
        return;
      }
      // ── GATE_STATE (reed switch report) ────────────────
      if (msg.type === 'GATE_STATE') {
        const isOpen = msg.isOpen === true;
        await prisma.device.update({
          where: { id: authenticatedDeviceId },
          data: { isOpen },
        });
        // Broadcast to all connected app clients
        broadcastToAppClients({
          type: 'GATE_STATE',
          deviceId: authenticatedDeviceId,
          isOpen,
        });
        console.log(`[ws] Device ${authenticatedDeviceId} gate state: ${isOpen ? 'OPEN' : 'CLOSED'}`);
        return;
      }
      // ── ACK (response to a TOGGLE we sent) ──────────
      if (msg.type === 'ACK') {
        // Resolve any pending toggle promise
        const pending = pendingToggles.get(authenticatedDeviceId);
        if (pending) {
          pending.resolve({ ok: msg.ok !== false, result: 'ACK' });
          pendingToggles.delete(authenticatedDeviceId);
        }
        return;
      }
    });

    ws.on('close', async () => {
      clearTimeout(authTimeout);
      if (heartbeatTimer) clearInterval(heartbeatTimer);

      if (authenticatedDeviceId) {
        connectedDevices.delete(authenticatedDeviceId);
        try {
          await prisma.device.update({
            where: { id: authenticatedDeviceId },
            data: { isOnline: false },
          });
        } catch { /* device may have been deleted */ }
        console.log(`[ws] Device ${authenticatedDeviceId} disconnected`);
      }
    });

    ws.on('error', (err) => {
      console.error('[ws] Connection error:', err.message);
    });
  });

  return deviceWss;
}

// ── Authenticate device by raw token ─────────────────────
async function authenticateDevice(rawToken) {
  if (!rawToken) return null;

  const devices = await prisma.device.findMany();
  for (const device of devices) {
    const match = await bcrypt.compare(rawToken, device.tokenHash);
    if (match) return device;
  }
  return null;
}

// ── Heartbeat monitor ────────────────────────────────────
function startHeartbeatMonitor(deviceId, ws) {
  return setInterval(async () => {
    const device = await prisma.device.findUnique({ where: { id: deviceId } });
    if (!device) return;

    const elapsed = Date.now() - new Date(device.lastSeen).getTime();
    if (elapsed > OFFLINE_THRESHOLD_MS) {
      await prisma.device.update({
        where: { id: deviceId },
        data: { isOnline: false },
      });
    }
  }, 60_000); // check every 60 seconds
}

// ── Send TOGGLE to a device ──────────────────────────────
// Returns a promise that resolves with { ok, result } or rejects on timeout
const pendingToggles = new Map();
const TOGGLE_TIMEOUT_MS = 10_000;

function sendToggle(deviceId) {
  return new Promise((resolve, reject) => {
    const ws = connectedDevices.get(deviceId);
    if (!ws || ws.readyState !== 1 /* OPEN */) {
      resolve({ ok: false, result: 'DEVICE_OFFLINE' });
      return;
    }

    // Send the TOGGLE command
    ws.send(JSON.stringify({ type: 'TOGGLE' }));

    // Wait for ACK or timeout
    const timer = setTimeout(() => {
      pendingToggles.delete(deviceId);
      resolve({ ok: false, result: 'TIMEOUT' });
    }, TOGGLE_TIMEOUT_MS);

    pendingToggles.set(deviceId, {
      resolve: (val) => {
        clearTimeout(timer);
        resolve(val);
      },
    });
  });
}

// ── Check if a device is connected ──────────────────────
function isDeviceConnected(deviceId) {
  const ws = connectedDevices.get(deviceId);
  return ws && ws.readyState === 1;
}

// ── Broadcast to all connected app clients ──────────────
function broadcastToAppClients(message) {
  const payload = JSON.stringify(message);
  for (const client of appClients) {
    if (client.readyState === 1) {
      client.send(payload);
    }
  }
}

// ── App-facing WebSocket (real-time gate state to mobile) ─
function initAppWebSocket(httpServer) {
  appWss = new WebSocketServer({ noServer: true });

  console.log('[ws] App WebSocket server ready on /app/ws');

  appWss.on('connection', (ws) => {
    appClients.add(ws);
    console.log(`[ws/app] Client connected (${appClients.size} total)`);

    ws.on('close', () => {
      appClients.delete(ws);
      console.log(`[ws/app] Client disconnected (${appClients.size} total)`);
    });

    ws.on('error', (err) => {
      console.error('[ws/app] Error:', err.message);
      appClients.delete(ws);
    });
  });

  // Single upgrade handler routes requests to the correct WSS
  httpServer.on('upgrade', (request, socket, head) => {
    const { pathname } = new URL(request.url, 'ws://base');

    if (pathname === '/device/ws') {
      deviceWss.handleUpgrade(request, socket, head, (ws) => {
        deviceWss.emit('connection', ws, request);
      });
    } else if (pathname === '/app/ws') {
      appWss.handleUpgrade(request, socket, head, (ws) => {
        appWss.emit('connection', ws, request);
      });
    } else {
      socket.destroy();
    }
  });

  return appWss;
}

module.exports = { initDeviceWebSocket, initAppWebSocket, sendToggle, isDeviceConnected };
