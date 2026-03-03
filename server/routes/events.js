const express = require('express');
const { z } = require('zod');
const prisma = require('../lib/prisma');
const { authenticate } = require('../middleware/auth');

const router = express.Router();

// All routes require authentication
router.use(authenticate);

// ── GET /gate/events — Activity feed ──────────────────────────────
const eventsQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(200).default(50),
  deviceId: z.string().uuid().optional(),
  before: z.string().datetime().optional(),
});

router.get('/events', async (req, res) => {
  try {
    const parsed = eventsQuerySchema.safeParse(req.query);
    if (!parsed.success) {
      return res.status(400).json({ error: parsed.error.issues[0].message });
    }

    const { limit, deviceId, before } = parsed.data;

    const where = {};
    if (deviceId) where.deviceId = deviceId;
    if (before) where.timestamp = { lt: new Date(before) };

    const events = await prisma.gateEvent.findMany({
      where,
      orderBy: { timestamp: 'desc' },
      take: limit,
      include: {
        device: { select: { name: true } },
      },
    });

    const result = events.map((e) => ({
      id: e.id,
      deviceId: e.deviceId,
      deviceName: e.device.name,
      event: e.event,
      triggeredBy: e.triggeredBy,
      timestamp: e.timestamp.toISOString(),
    }));

    return res.json(result);
  } catch (err) {
    console.error('[gate/events] error:', err);
    return res.status(500).json({ error: 'Internal server error.' });
  }
});

module.exports = router;
