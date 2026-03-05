const express = require('express');
const { z } = require('zod');
const prisma = require('../lib/prisma');
const { authenticate } = require('../middleware/auth');

const router = express.Router();

// All routes require authentication
router.use(authenticate);

// ── GET /gate/events — Activity feed ──────────────────────────────
const eventsQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(200).default(200),
  deviceId: z.string().uuid().optional(),
  before: z.string().datetime().optional(),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'date must be YYYY-MM-DD').optional(),
  dateStart: z.string().datetime().optional(),
  dateEnd: z.string().datetime().optional(),
});

// dateStart/dateEnd take priority over bare `date` — they carry the
// caller's local-day boundaries already converted to UTC so the server
// doesn't need to guess a timezone.

router.get('/events', async (req, res) => {
  try {
    const parsed = eventsQuerySchema.safeParse(req.query);
    if (!parsed.success) {
      return res.status(400).json({ error: parsed.error.issues[0].message });
    }

    const { limit, deviceId, before, date, dateStart, dateEnd } = parsed.data;

    const where = {};
    if (deviceId) where.deviceId = deviceId;

    // Timezone-aware range (preferred) → bare date (UTC) → cursor
    if (dateStart && dateEnd) {
      where.timestamp = { gte: new Date(dateStart), lte: new Date(dateEnd) };
    } else if (date) {
      const dayStart = new Date(date + 'T00:00:00.000Z');
      const dayEnd = new Date(date + 'T23:59:59.999Z');
      where.timestamp = { gte: dayStart, lte: dayEnd };
    } else if (before) {
      where.timestamp = { lt: new Date(before) };
    }

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
