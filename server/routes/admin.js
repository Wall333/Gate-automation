const express = require('express');
const { z } = require('zod');
const prisma = require('../lib/prisma');
const { authenticate, requireAdmin } = require('../middleware/auth');

const router = express.Router();

// All admin routes require auth + admin role
router.use(authenticate, requireAdmin);

// ── GET /admin/users ─────────────────────────────────────
// Optional query: ?status=pending
router.get('/users', async (req, res) => {
  try {
    const where = {};
    if (req.query.status) {
      where.status = req.query.status;
    }

    const users = await prisma.user.findMany({
      where,
      select: {
        id: true,
        email: true,
        name: true,
        picture: true,
        role: true,
        status: true,
        createdAt: true,
      },
      orderBy: { createdAt: 'desc' },
    });

    return res.json(users);
  } catch (err) {
    console.error('[admin/users] error:', err);
    return res.status(500).json({ error: 'Internal server error.' });
  }
});

// ── POST /admin/users/:id/approve ────────────────────────
router.post('/users/:id/approve', async (req, res) => {
  try {
    const user = await prisma.user.update({
      where: { id: req.params.id },
      data: { status: 'approved' },
      select: { id: true, email: true, name: true, status: true, role: true },
    });
    return res.json(user);
  } catch (err) {
    if (err.code === 'P2025') {
      return res.status(404).json({ error: 'User not found.' });
    }
    console.error('[admin/users/approve] error:', err);
    return res.status(500).json({ error: 'Internal server error.' });
  }
});

// ── POST /admin/users/:id/deny ───────────────────────────
router.post('/users/:id/deny', async (req, res) => {
  try {
    const user = await prisma.user.update({
      where: { id: req.params.id },
      data: { status: 'denied' },
      select: { id: true, email: true, name: true, status: true, role: true },
    });
    return res.json(user);
  } catch (err) {
    if (err.code === 'P2025') {
      return res.status(404).json({ error: 'User not found.' });
    }
    console.error('[admin/users/deny] error:', err);
    return res.status(500).json({ error: 'Internal server error.' });
  }
});

// ── GET /admin/audit ─────────────────────────────────────
router.get('/audit', async (req, res) => {
  try {
    const logs = await prisma.auditLog.findMany({
      include: {
        user: { select: { email: true, name: true } },
        device: { select: { name: true } },
      },
      orderBy: { timestamp: 'desc' },
      take: 100,
    });

    const result = logs.map((log) => ({
      id: log.id,
      userId: log.userId,
      userEmail: log.user.email,
      userName: log.user.name,
      deviceId: log.deviceId,
      deviceName: log.device.name,
      action: log.action,
      result: log.result,
      timestamp: log.timestamp,
    }));

    return res.json(result);
  } catch (err) {
    console.error('[admin/audit] error:', err);
    return res.status(500).json({ error: 'Internal server error.' });
  }
});

module.exports = router;
