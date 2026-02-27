const express = require('express');
const crypto = require('crypto');
const bcrypt = require('bcryptjs');
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

// ── DELETE /admin/users/:id — Remove a user ──────────────
router.delete('/users/:id', async (req, res) => {
  try {
    const { id } = req.params;

    // Prevent admin from deleting themselves
    if (id === req.user.id) {
      return res.status(400).json({ error: 'You cannot delete your own account.' });
    }

    const user = await prisma.user.findUnique({ where: { id } });
    if (!user) {
      return res.status(404).json({ error: 'User not found.' });
    }

    // Delete associated audit logs first, then the user
    await prisma.auditLog.deleteMany({ where: { userId: id } });
    await prisma.user.delete({ where: { id } });

    return res.json({ message: 'User deleted.', id });
  } catch (err) {
    console.error('[admin/users] delete error:', err);
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

// ── POST /admin/devices — Register a new device ─────────
const createDeviceSchema = z.object({
  name: z.string().min(1).max(100).default('Gate Controller'),
});

router.post('/devices', async (req, res) => {
  try {
    const parsed = createDeviceSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: parsed.error.issues[0].message });
    }

    // Generate a random device token
    const rawToken = crypto.randomBytes(32).toString('hex');
    const tokenHash = await bcrypt.hash(rawToken, 10);

    const device = await prisma.device.create({
      data: {
        name: parsed.data.name,
        tokenHash,
      },
      select: { id: true, name: true, createdAt: true },
    });

    // Return the raw token ONCE — it can't be retrieved again
    return res.status(201).json({
      ...device,
      token: rawToken,
      message: 'Device created. Save the token — it cannot be retrieved again.',
    });
  } catch (err) {
    console.error('[admin/devices] error:', err);
    return res.status(500).json({ error: 'Internal server error.' });
  }
});

// ── GET /admin/devices — List all devices ────────────────
router.get('/devices', async (_req, res) => {
  try {
    const devices = await prisma.device.findMany({
      select: {
        id: true,
        name: true,
        isOnline: true,
        lastSeen: true,
        createdAt: true,
      },
      orderBy: { createdAt: 'desc' },
    });
    return res.json(devices);
  } catch (err) {
    console.error('[admin/devices] error:', err);
    return res.status(500).json({ error: 'Internal server error.' });
  }
});

// ── PATCH /admin/devices/:id — Update a device ──────────
const updateDeviceSchema = z.object({
  name: z.string().min(1).max(100).optional(),
});

router.patch('/devices/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const parsed = updateDeviceSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: parsed.error.issues[0].message });
    }

    // Check device exists
    const existing = await prisma.device.findUnique({ where: { id } });
    if (!existing) {
      return res.status(404).json({ error: 'Device not found.' });
    }

    const device = await prisma.device.update({
      where: { id },
      data: parsed.data,
      select: { id: true, name: true, isOnline: true, lastSeen: true, createdAt: true },
    });

    return res.json(device);
  } catch (err) {
    console.error('[admin/devices] update error:', err);
    return res.status(500).json({ error: 'Internal server error.' });
  }
});

// ── DELETE /admin/devices/:id — Remove a device ──────────
router.delete('/devices/:id', async (req, res) => {
  try {
    const { id } = req.params;

    // Check device exists
    const device = await prisma.device.findUnique({ where: { id } });
    if (!device) {
      return res.status(404).json({ error: 'Device not found.' });
    }

    // Delete associated audit logs first, then the device
    await prisma.auditLog.deleteMany({ where: { deviceId: id } });
    await prisma.device.delete({ where: { id } });

    return res.json({ message: 'Device deleted.', id });
  } catch (err) {
    console.error('[admin/devices] delete error:', err);
    return res.status(500).json({ error: 'Internal server error.' });
  }
});

module.exports = router;
