const express = require('express');
const { OAuth2Client } = require('google-auth-library');
const jwt = require('jsonwebtoken');
const { z } = require('zod');
const { rateLimit } = require('express-rate-limit');
const prisma = require('../lib/prisma');

const router = express.Router();

// ── Rate limiter: 5 requests / minute on auth ────────────
const authLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 5,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many auth requests, please try again later.' },
});

// ── Request validation ───────────────────────────────────
const googleAuthSchema = z.object({
  idToken: z.string().min(1).optional(),
  code: z.string().min(1).optional(),
  redirectUri: z.string().min(1).optional(),
}).refine(data => data.idToken || data.code, {
  message: 'Either idToken or code is required',
});

// ── Google token verifier ────────────────────────────────
const googleClient = new OAuth2Client(process.env.GOOGLE_CLIENT_ID);

async function verifyGoogleToken(idToken) {
  const ticket = await googleClient.verifyIdToken({
    idToken,
    audience: process.env.GOOGLE_CLIENT_ID,
  });
  return ticket.getPayload();
}

async function exchangeCodeForIdToken(code, redirectUri) {
  const client = new OAuth2Client(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET || '',
    redirectUri,
  );
  const { tokens } = await client.getToken(code);
  if (!tokens.id_token) {
    throw new Error('No id_token in token response');
  }
  return tokens.id_token;
}

// ── POST /auth/google ────────────────────────────────────
router.post('/google', authLimiter, async (req, res) => {
  try {
    // Validate request body
    const parsed = googleAuthSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: parsed.error.issues[0].message });
    }

    let idToken = parsed.data.idToken;

    // If we received an authorization code, exchange it for an id_token
    if (!idToken && parsed.data.code) {
      try {
        idToken = await exchangeCodeForIdToken(
          parsed.data.code,
          parsed.data.redirectUri || '',
        );
      } catch (err) {
        console.error('[auth/google] code exchange error:', err.message);
        return res.status(401).json({ error: 'Failed to exchange authorization code.' });
      }
    }

    // Verify Google token
    let payload;
    try {
      payload = await verifyGoogleToken(idToken);
    } catch (err) {
      return res.status(401).json({ error: 'Invalid Google token.' });
    }

    const { email, name, picture } = payload;

    // Upsert user
    let user = await prisma.user.findUnique({ where: { email } });

    if (!user) {
      // Check if this is the admin email
      const isAdmin =
        email.toLowerCase() === (process.env.ADMIN_EMAIL || '').toLowerCase();

      user = await prisma.user.create({
        data: {
          email,
          name: name || email,
          picture: picture || '',
          role: isAdmin ? 'admin' : 'user',
          status: isAdmin ? 'approved' : 'pending',
        },
      });
    }

    // If not approved, return early
    if (user.status !== 'approved') {
      return res.json({
        approved: false,
        message: 'Your account is pending admin approval.',
      });
    }

    // Issue JWT
    const token = jwt.sign(
      { sub: user.id, email: user.email, role: user.role },
      process.env.JWT_SECRET,
      { expiresIn: '7d' }
    );

    return res.json({
      approved: true,
      token,
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        role: user.role,
      },
    });
  } catch (err) {
    console.error('[auth/google] error:', err);
    return res.status(500).json({ error: 'Internal server error.' });
  }
});

// ── POST /auth/dev-login (development only) ──────────────
// Allows sign-in with just an email for local testing.
// Only available when NODE_ENV is not 'production'.
router.post('/dev-login', authLimiter, async (req, res) => {
  if (process.env.NODE_ENV === 'production') {
    return res.status(404).json({ error: 'Not found' });
  }

  try {
    const { email, name } = req.body;
    if (!email) {
      return res.status(400).json({ error: 'email is required' });
    }

    // Upsert user
    let user = await prisma.user.findUnique({ where: { email } });

    if (!user) {
      const isAdmin =
        email.toLowerCase() === (process.env.ADMIN_EMAIL || '').toLowerCase();

      user = await prisma.user.create({
        data: {
          email,
          name: name || email,
          picture: '',
          role: isAdmin ? 'admin' : 'user',
          status: isAdmin ? 'approved' : 'pending',
        },
      });
    }

    if (user.status !== 'approved') {
      return res.json({
        approved: false,
        message: 'Your account is pending admin approval.',
      });
    }

    const token = jwt.sign(
      { sub: user.id, email: user.email, role: user.role },
      process.env.JWT_SECRET,
      { expiresIn: '7d' }
    );

    return res.json({
      approved: true,
      token,
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        role: user.role,
      },
    });
  } catch (err) {
    console.error('[auth/dev-login] error:', err);
    return res.status(500).json({ error: 'Internal server error.' });
  }
});

module.exports = router;
