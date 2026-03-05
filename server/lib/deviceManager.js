const { WebSocketServer } = require('ws');
const bcrypt = require('bcryptjs');
const prisma = require('./prisma');
const { sendPush } = require('./notificationService');

// ── State ────────────────────────────────────────────────
// Map of deviceId → WebSocket connection (device connections)
const connectedDevices = new Map();

// Set of WebSocket connections from mobile/web app clients
const appClients = new Set();

// How long before we consider a device offline (ms)
const OFFLINE_THRESHOLD_MS = 90 * 1000;

// Attribution window: if a TOGGLE audit log exists within this many ms
// before a GATE_STATE, attribute the event to that user
const ATTRIBUTION_WINDOW_MS = 30_000;

// Open-too-long timers: Map<`${deviceId}:${userId}`, timeoutId>
const openTooLongTimers = new Map();

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

          // Mark device online + store firmware version if reported
          const updateData = { isOnline: true, lastSeen: new Date() };
          if (msg.firmwareVersion) {
            updateData.firmwareVersion = String(msg.firmwareVersion);
          }
          await prisma.device.update({
            where: { id: device.id },
            data: updateData,
          });

          ws.send(JSON.stringify({ type: 'AUTHENTICATED', deviceId: device.id }));
          const fwTag = msg.firmwareVersion ? ` (fw ${msg.firmwareVersion})` : '';
          console.log(`[ws] Device "${device.name}" (${device.id}) connected${fwTag}`);

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

        // Log gate event with user attribution
        await logGateEvent(authenticatedDeviceId, isOpen);

        console.log(`[ws] Device ${authenticatedDeviceId} gate state: ${isOpen ? 'OPEN' : 'CLOSED'}`);
        return;
      }
      // ── OTA_STATUS (firmware update progress) ──────────
      if (msg.type === 'OTA_STATUS') {
        // Forward OTA progress to all app clients
        broadcastToAppClients({
          type: 'OTA_STATUS',
          deviceId: authenticatedDeviceId,
          status: msg.status,
          message: msg.message,
        });
        console.log(`[ota] Device ${authenticatedDeviceId}: ${msg.status} — ${msg.message}`);
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

// ── Send OTA_UPDATE command to a device ─────────────────
function sendOTAUpdate(deviceId, firmwareUrl) {
  const ws = connectedDevices.get(deviceId);
  if (!ws || ws.readyState !== 1) {
    console.error(`[ota] Device ${deviceId} not connected`);
    return false;
  }

  ws.send(JSON.stringify({
    type: 'OTA_UPDATE',
    url: firmwareUrl,
  }));

  console.log(`[ota] Sent OTA_UPDATE to device ${deviceId}: ${firmwareUrl}`);
  return true;
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

// ── Log gate event + send notifications ─────────────────
async function logGateEvent(deviceId, isOpen) {
  const eventType = isOpen ? 'OPENED' : 'CLOSED';

  // Attribution: check for a recent TOGGLE from the app
  let triggeredBy = null;
  let triggeredByUserId = null;

  try {
    const cutoff = new Date(Date.now() - ATTRIBUTION_WINDOW_MS);
    const recentToggle = await prisma.auditLog.findFirst({
      where: {
        deviceId,
        action: 'TOGGLE',
        result: 'ACK',
        timestamp: { gte: cutoff },
      },
      orderBy: { timestamp: 'desc' },
      include: { user: { select: { id: true, name: true } } },
    });

    if (recentToggle) {
      triggeredBy = recentToggle.user.name;
      triggeredByUserId = recentToggle.user.id;
    }
  } catch (err) {
    console.error('[events] Attribution lookup error:', err.message);
  }

  // Create the event record
  let gateEvent;
  try {
    gateEvent = await prisma.gateEvent.create({
      data: {
        deviceId,
        event: eventType,
        triggeredBy,
        triggeredByUserId,
      },
    });
  } catch (err) {
    console.error('[events] Failed to create GateEvent:', err.message);
    return;
  }

  // Broadcast the event to app clients for real-time activity feed
  const device = await prisma.device.findUnique({ where: { id: deviceId }, select: { name: true } });
  broadcastToAppClients({
    type: 'GATE_EVENT',
    id: gateEvent.id,
    deviceId,
    deviceName: device?.name || 'Unknown',
    event: eventType,
    triggeredBy,
    timestamp: gateEvent.timestamp.toISOString(),
  });

  // Handle open-too-long timers
  if (isOpen) {
    startOpenTooLongTimers(deviceId, device?.name || 'Gate');
  } else {
    cancelOpenTooLongTimers(deviceId);
  }

  // Send push notifications
  await sendGateNotifications(deviceId, device?.name || 'Gate', eventType, triggeredBy, triggeredByUserId);
}

// ── Push notifications for gate events ──────────────────
async function sendGateNotifications(deviceId, deviceName, eventType, triggeredBy, triggeredByUserId) {
  try {
    const field = eventType === 'OPENED' ? 'notifyOnOpen' : 'notifyOnClose';

    const prefs = await prisma.notificationPreference.findMany({
      where: {
        [field]: true,
        fcmToken: { not: null },
        // Don't notify the user who triggered it (they already know)
        ...(triggeredByUserId ? { userId: { not: triggeredByUserId } } : {}),
      },
    });

    if (prefs.length === 0) return;

    const title = eventType === 'OPENED' ? 'Gate Opened' : 'Gate Closed';
    const body = triggeredBy
      ? `${deviceName} was ${eventType.toLowerCase()} by ${triggeredBy}`
      : `${deviceName} was ${eventType.toLowerCase()}`;

    const data = { type: `GATE_${eventType}`, deviceId };

    for (const pref of prefs) {
      const result = await sendPush(pref.fcmToken, title, body, data);
      if (result === 'expired' && pref.fcmToken) {
        // Token is permanently invalid — clear it
        try {
          await prisma.notificationPreference.update({
            where: { id: pref.id },
            data: { fcmToken: null },
          });
          console.log(`[notify] Cleared expired token for user ${pref.userId}`);
        } catch { /* ignore */ }
      }
    }
  } catch (err) {
    console.error('[notify] Error sending gate notifications:', err.message);
  }
}

// ── Open-too-long timers ────────────────────────────────
async function startOpenTooLongTimers(deviceId, deviceName) {
  try {
    const prefs = await prisma.notificationPreference.findMany({
      where: {
        openTooLongMin: { not: null },
        fcmToken: { not: null },
      },
    });

    for (const pref of prefs) {
      const key = `${deviceId}:${pref.userId}`;
      // Clear any existing timer for this device+user
      if (openTooLongTimers.has(key)) {
        clearTimeout(openTooLongTimers.get(key));
      }

      const delayMs = pref.openTooLongMin * 60 * 1000;
      const timer = setTimeout(async () => {
        openTooLongTimers.delete(key);
        // Check if gate is still open
        try {
          const device = await prisma.device.findUnique({ where: { id: deviceId } });
          if (device && device.isOpen) {
            await sendPush(
              pref.fcmToken,
              'Gate Still Open',
              `${deviceName} has been open for ${pref.openTooLongMin} minute${pref.openTooLongMin === 1 ? '' : 's'}`,
              { type: 'GATE_OPEN_TOO_LONG', deviceId }
            );
            console.log(`[notify] Open-too-long alert sent for device ${deviceId} to user ${pref.userId}`);
          }
        } catch (err) {
          console.error('[notify] Open-too-long timer error:', err.message);
        }
      }, delayMs);

      openTooLongTimers.set(key, timer);
    }
  } catch (err) {
    console.error('[notify] Error starting open-too-long timers:', err.message);
  }
}

function cancelOpenTooLongTimers(deviceId) {
  for (const [key, timer] of openTooLongTimers.entries()) {
    if (key.startsWith(`${deviceId}:`)) {
      clearTimeout(timer);
      openTooLongTimers.delete(key);
    }
  }
}

// ── Recover open-too-long timers after server restart ───
async function recoverOpenTooLongTimers() {
  try {
    const openDevices = await prisma.device.findMany({
      where: { isOpen: true },
    });

    if (openDevices.length === 0) return;

    for (const device of openDevices) {
      // Find the most recent OPENED event for this device
      const lastOpened = await prisma.gateEvent.findFirst({
        where: { deviceId: device.id, event: 'OPENED' },
        orderBy: { timestamp: 'desc' },
      });

      if (!lastOpened) continue;

      const elapsedMs = Date.now() - new Date(lastOpened.timestamp).getTime();

      const prefs = await prisma.notificationPreference.findMany({
        where: {
          openTooLongMin: { not: null },
          fcmToken: { not: null },
        },
      });

      for (const pref of prefs) {
        const thresholdMs = pref.openTooLongMin * 60 * 1000;
        const remainingMs = thresholdMs - elapsedMs;

        const key = `${device.id}:${pref.userId}`;

        if (remainingMs <= 0) {
          // Already overdue — fire immediately
          await sendPush(
            pref.fcmToken,
            'Gate Still Open',
            `${device.name} has been open for ${pref.openTooLongMin} minute${pref.openTooLongMin === 1 ? '' : 's'}`,
            { type: 'GATE_OPEN_TOO_LONG', deviceId: device.id }
          );
          console.log(`[notify] Recovered open-too-long alert (overdue) for device ${device.id}`);
        } else {
          // Start timer for remaining time
          const timer = setTimeout(async () => {
            openTooLongTimers.delete(key);
            try {
              const d = await prisma.device.findUnique({ where: { id: device.id } });
              if (d && d.isOpen) {
                await sendPush(
                  pref.fcmToken,
                  'Gate Still Open',
                  `${device.name} has been open for ${pref.openTooLongMin} minute${pref.openTooLongMin === 1 ? '' : 's'}`,
                  { type: 'GATE_OPEN_TOO_LONG', deviceId: device.id }
                );
              }
            } catch (err) {
              console.error('[notify] Recovered timer error:', err.message);
            }
          }, remainingMs);

          openTooLongTimers.set(key, timer);
          console.log(`[notify] Recovered open-too-long timer for device ${device.id}, ${Math.round(remainingMs / 1000)}s remaining`);
        }
      }
    }
  } catch (err) {
    console.error('[notify] Error recovering open-too-long timers:', err.message);
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

module.exports = { initDeviceWebSocket, initAppWebSocket, sendToggle, isDeviceConnected, sendOTAUpdate, recoverOpenTooLongTimers };
