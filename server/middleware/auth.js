const jwt = require('jsonwebtoken');
const prisma = require('../lib/prisma');

/**
 * Verify JWT and attach `req.user` (full DB record).
 * Returns 401 if token is missing/invalid, 403 if user not found or not approved.
 */
function authenticate(req, res, next) {
  const header = req.headers.authorization;
  if (!header || !header.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Missing or malformed Authorization header.' });
  }

  const token = header.slice(7);

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    // Attach decoded payload immediately; full user fetched below
    req.tokenPayload = decoded;
  } catch (err) {
    return res.status(401).json({ error: 'Invalid or expired token.' });
  }

  // Fetch full user from DB to get current role/status
  prisma.user
    .findUnique({ where: { id: req.tokenPayload.sub } })
    .then((user) => {
      if (!user) {
        return res.status(403).json({ error: 'User not found.' });
      }
      if (user.status !== 'approved') {
        return res.status(403).json({ error: 'Account not approved.' });
      }
      req.user = user;
      next();
    })
    .catch((err) => {
      console.error('[auth middleware] DB error:', err);
      return res.status(500).json({ error: 'Internal server error.' });
    });
}

/**
 * Require `role: "admin"`. Must be used after `authenticate`.
 */
function requireAdmin(req, res, next) {
  if (!req.user || req.user.role !== 'admin') {
    return res.status(403).json({ error: 'Admin access required.' });
  }
  next();
}

module.exports = { authenticate, requireAdmin };
