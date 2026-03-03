const express = require('express');
const { z } = require('zod');
const prisma = require('../lib/prisma');
const { authenticate } = require('../middleware/auth');

const router = express.Router();

// All routes require authentication
router.use(authenticate);

// ── GET /user/notification-preferences ────────────────────────────
router.get('/notification-preferences', async (req, res) => {
  try {
    const pref = await prisma.notificationPreference.findUnique({
      where: { userId: req.user.id },
    });

    // Return defaults if no preferences saved yet
    return res.json({
      notifyOnOpen: pref?.notifyOnOpen ?? false,
      notifyOnClose: pref?.notifyOnClose ?? false,
      openTooLongMin: pref?.openTooLongMin ?? null,
    });
  } catch (err) {
    console.error('[user/notification-preferences] GET error:', err);
    return res.status(500).json({ error: 'Internal server error.' });
  }
});

// ── PUT /user/notification-preferences ────────────────────────────
const prefsSchema = z.object({
  notifyOnOpen: z.boolean(),
  notifyOnClose: z.boolean(),
  openTooLongMin: z.number().int().min(1).max(60).nullable(),
});

router.put('/notification-preferences', async (req, res) => {
  try {
    const parsed = prefsSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: parsed.error.issues[0].message });
    }

    const { notifyOnOpen, notifyOnClose, openTooLongMin } = parsed.data;

    const pref = await prisma.notificationPreference.upsert({
      where: { userId: req.user.id },
      create: {
        userId: req.user.id,
        notifyOnOpen,
        notifyOnClose,
        openTooLongMin,
      },
      update: {
        notifyOnOpen,
        notifyOnClose,
        openTooLongMin,
      },
    });

    return res.json({
      notifyOnOpen: pref.notifyOnOpen,
      notifyOnClose: pref.notifyOnClose,
      openTooLongMin: pref.openTooLongMin,
      updatedAt: pref.updatedAt.toISOString(),
    });
  } catch (err) {
    console.error('[user/notification-preferences] PUT error:', err);
    return res.status(500).json({ error: 'Internal server error.' });
  }
});

// ── POST /user/fcm-token ─────────────────────────────────────────
const fcmSchema = z.object({
  fcmToken: z.string().min(1),
});

router.post('/fcm-token', async (req, res) => {
  try {
    const parsed = fcmSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: parsed.error.issues[0].message });
    }

    await prisma.notificationPreference.upsert({
      where: { userId: req.user.id },
      create: {
        userId: req.user.id,
        fcmToken: parsed.data.fcmToken,
      },
      update: {
        fcmToken: parsed.data.fcmToken,
      },
    });

    return res.json({ ok: true });
  } catch (err) {
    console.error('[user/fcm-token] error:', err);
    return res.status(500).json({ error: 'Internal server error.' });
  }
});

module.exports = router;
