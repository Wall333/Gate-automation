const express = require('express');
const { z } = require('zod');
const { rateLimit } = require('express-rate-limit');
const prisma = require('../lib/prisma');
const { sendToggle, sendOTAUpdate, isDeviceConnected } = require('../lib/deviceManager');
const { authenticate } = require('../middleware/auth');

const router = express.Router();

// All gate routes require an authenticated, approved user
router.use(authenticate);

// ── Rate limiter: 20 requests / minute on gate toggle ────
const gateLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many requests, please try again later.' },
});

// ── Request validation ───────────────────────────────────
const toggleSchema = z.object({
  deviceId: z.string().uuid('deviceId must be a valid UUID'),
});

// ── POST /gate/toggle ────────────────────────────────────
router.post('/toggle', gateLimiter, async (req, res) => {
  try {
    // Validate body
    const parsed = toggleSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: parsed.error.issues[0].message });
    }

    const { deviceId } = parsed.data;

    // Check device exists
    const device = await prisma.device.findUnique({ where: { id: deviceId } });
    if (!device) {
      return res.status(404).json({ error: 'Device not found.' });
    }

    // Send TOGGLE to device via WebSocket
    const { ok, result } = await sendToggle(deviceId);

    // Audit log — always log, success or failure
    await prisma.auditLog.create({
      data: {
        userId: req.user.id,
        deviceId,
        action: 'TOGGLE',
        result,
      },
    });

    return res.json({ ok, action: 'TOGGLE', result });
  } catch (err) {
    console.error('[gate/toggle] error:', err);
    return res.status(500).json({ error: 'Internal server error.' });
  }
});

// ── GET /gate/status ─────────────────────────────────────
router.get('/status', async (_req, res) => {
  try {
    const devices = await prisma.device.findMany({
      select: {
        id: true,
        name: true,
        isOnline: true,
        isOpen: true,
        firmwareVersion: true,
        lastSeen: true,
      },
    });

    return res.json({ devices });
  } catch (err) {
    console.error('[gate/status] error:', err);
    return res.status(500).json({ error: 'Internal server error.' });
  }
});

// ── GET /gate/firmware/latest — Latest firmware (any authenticated user) ──
router.get('/firmware/latest', async (_req, res) => {
  try {
    const latest = await prisma.firmware.findFirst({
      select: {
        id: true,
        filename: true,
        version: true,
        size: true,
        uploadedAt: true,
      },
      orderBy: { uploadedAt: 'desc' },
    });
    if (!latest) {
      return res.status(404).json({ error: 'No firmware uploaded.' });
    }
    return res.json(latest);
  } catch (err) {
    console.error('[gate/firmware/latest] error:', err);
    return res.status(500).json({ error: 'Internal server error.' });
  }
});

// ── POST /gate/devices/:id/ota — Trigger OTA update (any user) ──
router.post('/devices/:id/ota', async (req, res) => {
  try {
    const { id } = req.params;
    const { firmwareId } = req.body;

    if (!firmwareId) {
      return res.status(400).json({ error: 'firmwareId is required.' });
    }

    // Check device exists and is online
    const device = await prisma.device.findUnique({ where: { id } });
    if (!device) {
      return res.status(404).json({ error: 'Device not found.' });
    }
    if (!isDeviceConnected(id)) {
      return res.status(409).json({ error: 'Device is offline.' });
    }

    // Check firmware exists
    const firmware = await prisma.firmware.findUnique({ where: { id: firmwareId } });
    if (!firmware) {
      return res.status(404).json({ error: 'Firmware not found.' });
    }

    const serverHost = req.headers.host || `${req.hostname}:${req.socket.localPort}`;
    const firmwareUrl = `https://${serverHost}/firmware/download/${firmware.storedName}`;

    sendOTAUpdate(id, firmwareUrl);

    // Audit log
    await prisma.auditLog.create({
      data: {
        userId: req.user.id,
        deviceId: id,
        action: 'OTA_UPDATE',
        result: `Triggered firmware ${firmware.version || firmware.filename}`,
      },
    });

    console.log(`[ota] User ${req.user.email} triggered OTA for device ${id}`);
    return res.json({
      message: 'OTA update triggered.',
      deviceId: id,
      firmwareId: firmware.id,
      firmwareUrl,
    });
  } catch (err) {
    console.error('[ota] User trigger error:', err);
    return res.status(500).json({ error: 'Internal server error.' });
  }
});

module.exports = router;
