const express = require('express');
const { z } = require('zod');
const { rateLimit } = require('express-rate-limit');
const prisma = require('../lib/prisma');
const { sendToggle } = require('../lib/deviceManager');
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
        lastSeen: true,
      },
    });

    return res.json({ devices });
  } catch (err) {
    console.error('[gate/status] error:', err);
    return res.status(500).json({ error: 'Internal server error.' });
  }
});

module.exports = router;
