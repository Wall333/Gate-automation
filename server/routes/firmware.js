const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const prisma = require('../lib/prisma');
const { authenticate, requireAdmin } = require('../middleware/auth');
const { sendOTAUpdate, isDeviceConnected } = require('../lib/deviceManager');

const router = express.Router();

// ── Storage config ───────────────────────────────────────
const FIRMWARE_DIR = path.join(__dirname, '..', 'firmware');

// Ensure firmware directory exists
if (!fs.existsSync(FIRMWARE_DIR)) {
  fs.mkdirSync(FIRMWARE_DIR, { recursive: true });
}

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, FIRMWARE_DIR),
  filename: (_req, file, cb) => {
    const ext = path.extname(file.originalname) || '.bin';
    const storedName = `${crypto.randomUUID()}${ext}`;
    cb(null, storedName);
  },
});

const upload = multer({
  storage,
  limits: { fileSize: 2 * 1024 * 1024 }, // 2 MB max
  fileFilter: (_req, file, cb) => {
    const allowed = ['.bin', '.ota'];
    const ext = path.extname(file.originalname).toLowerCase();
    if (allowed.includes(ext)) {
      cb(null, true);
    } else {
      cb(new Error('Only .bin and .ota files are allowed'));
    }
  },
});

// ── POST /admin/firmware — Upload firmware (admin only) ──
router.post(
  '/admin/firmware',
  authenticate,
  requireAdmin,
  upload.single('firmware'),
  async (req, res) => {
    try {
      if (!req.file) {
        return res.status(400).json({ error: 'No firmware file provided.' });
      }

      const version = req.body.version || '';

      const firmware = await prisma.firmware.create({
        data: {
          filename: req.file.originalname,
          storedName: req.file.filename,
          version,
          size: req.file.size,
        },
        select: {
          id: true,
          filename: true,
          version: true,
          size: true,
          uploadedAt: true,
        },
      });

      console.log(`[firmware] Uploaded: ${req.file.originalname} (${req.file.size} bytes)`);
      return res.status(201).json(firmware);
    } catch (err) {
      console.error('[firmware] Upload error:', err);
      return res.status(500).json({ error: 'Internal server error.' });
    }
  },
);

// ── GET /admin/firmware — List uploaded firmware (admin) ─
router.get('/admin/firmware', authenticate, requireAdmin, async (_req, res) => {
  try {
    const list = await prisma.firmware.findMany({
      select: {
        id: true,
        filename: true,
        version: true,
        size: true,
        uploadedAt: true,
      },
      orderBy: { uploadedAt: 'desc' },
      take: 20,
    });
    return res.json(list);
  } catch (err) {
    console.error('[firmware] List error:', err);
    return res.status(500).json({ error: 'Internal server error.' });
  }
});

// ── DELETE /admin/firmware/:id — Remove firmware (admin) ─
router.delete('/admin/firmware/:id', authenticate, requireAdmin, async (req, res) => {
  try {
    const fw = await prisma.firmware.findUnique({ where: { id: req.params.id } });
    if (!fw) {
      return res.status(404).json({ error: 'Firmware not found.' });
    }

    // Delete file from disk
    const filePath = path.join(FIRMWARE_DIR, fw.storedName);
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
    }

    await prisma.firmware.delete({ where: { id: fw.id } });
    return res.json({ message: 'Firmware deleted.', id: fw.id });
  } catch (err) {
    console.error('[firmware] Delete error:', err);
    return res.status(500).json({ error: 'Internal server error.' });
  }
});

// ── GET /firmware/download/:storedName — Serve firmware ──
// No auth — the Arduino needs to download this directly via HTTP
router.get('/firmware/download/:storedName', (req, res) => {
  const filePath = path.join(FIRMWARE_DIR, req.params.storedName);
  if (!fs.existsSync(filePath)) {
    return res.status(404).json({ error: 'Firmware file not found.' });
  }

  res.setHeader('Content-Type', 'application/octet-stream');
  res.sendFile(filePath);
});

// ── POST /admin/devices/:id/ota — Trigger OTA update ────
router.post(
  '/admin/devices/:id/ota',
  authenticate,
  requireAdmin,
  async (req, res) => {
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

      // Build the download URL the Arduino will use
      const serverHost = req.headers.host || `${req.hostname}:${req.socket.localPort}`;
      const protocol = req.headers['x-forwarded-proto'] || req.protocol;
      const firmwareUrl = `${protocol}://${serverHost}/firmware/download/${firmware.storedName}`;

      // Send OTA_UPDATE command to the device
      sendOTAUpdate(id, firmwareUrl);

      console.log(`[ota] Triggered OTA for device ${id} with firmware ${firmware.filename}`);
      return res.json({
        message: 'OTA update triggered.',
        deviceId: id,
        firmwareId: firmware.id,
        firmwareUrl,
      });
    } catch (err) {
      console.error('[ota] Trigger error:', err);
      return res.status(500).json({ error: 'Internal server error.' });
    }
  },
);

module.exports = router;
