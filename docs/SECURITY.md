# Security Guide

This document covers the security model of the Gate Controller system, known risks, and how to mitigate them.

---

## Architecture Overview

```
Phone App  ──(HTTPS)──►  Cloud Server  ◄──(WSS)──  Arduino
                              │
                         SQLite DB
                       (users, audit logs)
```

All communication should go through the cloud server. The phone and Arduino never talk directly over the internet.

---

## Current Security Features

| Feature | Implementation | Location |
|---------|---------------|----------|
| Authentication | Google OAuth 2.0 (native Sign-In) | `routes/auth.js` |
| Authorization | JWT tokens (signed, expiring) | `middleware/auth.js` |
| Rate Limiting | 5 requests/min on auth endpoints | `routes/auth.js` |
| Input Validation | Zod schemas on all endpoints | All route files |
| Admin Approval | New users require manual approval | `routes/auth.js` |
| Device Auth | Per-device unique tokens (auto-generated via admin API, bcrypt-hashed) | `lib/deviceManager.js`, `routes/admin.js` |
| Audit Logging | All gate actions logged with user + timestamp | `routes/gate.js` |
| Secret Management | `.env` file, never committed to git | `.gitignore` |
| Secure Storage | JWT stored in device SecureStore (encrypted) | `mobile/src/api.js` |

---

## Risk Assessment & Mitigations

### 1. Unencrypted Traffic (HTTP)

**Risk**: HIGH — Without HTTPS, JWT tokens, Google ID tokens, and API data travel in plain text. Anyone on the same network can intercept them.

**Current Status**: The development setup uses plain HTTP (`http://192.168.1.166:3000`). The Android app has `usesCleartextTraffic: true` to allow this.

**Mitigation**:
- In production, **always use HTTPS**. Set up a reverse proxy (Nginx or Caddy) with a free TLS certificate from Let's Encrypt.
- Once HTTPS is configured, remove `usesCleartextTraffic: true` from `app.json`.
- Use Caddy for the simplest setup — it handles TLS certificates automatically.

```bash
# Example Caddy config (Caddyfile)
gate.yourdomain.com {
    reverse_proxy localhost:3000
}
```

### 2. Exposed Server Port

**Risk**: MEDIUM — The cloud VM has a public IP. If port 3000 is open, anyone can attempt to access the API.

**Mitigation**:
- Use a reverse proxy (Nginx/Caddy) on port 443 and **close port 3000** in the cloud firewall (GCP Firewall Rules). Only ports 80 and 443 should be open.
- The server already has rate limiting on auth endpoints, which slows down brute-force attempts.
- Consider adding `helmet` middleware for HTTP security headers:
  ```bash
  npm install helmet
  ```
  ```js
  const helmet = require('helmet');
  app.use(helmet());
  ```

### 3. JWT Token Theft

**Risk**: MEDIUM — If an attacker obtains a valid JWT, they can impersonate the user until the token expires.

**Mitigation**:
- Use HTTPS (see #1) to prevent token interception.
- Set a reasonable token expiration (currently 7 days). Shorten for higher security:
  ```js
  jwt.sign(payload, secret, { expiresIn: '24h' });
  ```
- On the mobile app, tokens are stored in `expo-secure-store`, which uses the device's encrypted keychain.
- Consider implementing token refresh and token revocation in future versions.

### 4. Device Token (Arduino Authentication)

**Risk**: MEDIUM — Each Arduino authenticates to the server with a unique device token. If a token is compromised, an attacker could impersonate that specific device.

**Current Implementation**:
- Each device gets its own unique token, auto-generated via `POST /admin/devices` (32 random bytes = 64 hex characters).
- The raw token is returned **once** at creation and sent to the Arduino during provisioning. It cannot be retrieved again from the server.
- The server stores only the **bcrypt hash** of the token (`tokenHash` column in the Devices table).
- The token is stored in the Arduino's EEPROM (not in source code).

**Mitigation**:
- Compromise of one device token does not affect other devices (per-device isolation).
- To rotate a token: delete the device via `/admin/devices/:id`, re-register it with `POST /admin/devices`, and re-provision the Arduino.
- In future versions, consider mutual TLS (mTLS) for stronger device identity.

### 5. SQL Injection

**Risk**: LOW — Prisma ORM uses parameterized queries, which prevents SQL injection by default.

**Mitigation**:
- Never use raw SQL queries (`prisma.$queryRaw`) with user input.
- All request bodies are validated with Zod schemas before reaching the database.

### 6. Unauthorized Physical Access (Arduino)

**Risk**: MEDIUM — If someone has physical access to the Arduino, they could:
- Read EEPROM (WiFi password, server URL, device token)
- Trigger the relay manually
- Factory-reset the device

**Mitigation**:
- Install the Arduino in a locked enclosure.
- The factory reset requires holding pin 3 LOW during boot — not obvious without documentation.
- Consider adding EEPROM encryption in a future version (AES-128 with a hardcoded key, though this is limited security-through-obscurity on embedded devices).

### 7. Account Enumeration

**Risk**: LOW — The Google Sign-In flow doesn't reveal whether an email is registered. New users are created automatically and placed in a "pending" state.

**Mitigation**:
- Auth responses don't differentiate between "new user" and "existing unapproved user" in error messages.
- Rate limiting prevents rapid enumeration attempts.

### 8. Denial of Service (DoS)

**Risk**: MEDIUM — The server could be overwhelmed with requests.

**Mitigation**:
- Rate limiting is enabled on auth endpoints (5 req/min).
- Add global rate limiting for all endpoints:
  ```js
  const globalLimiter = rateLimit({ windowMs: 60 * 1000, max: 100 });
  app.use(globalLimiter);
  ```
- Google Cloud includes basic DDoS protection for Compute Engine instances.
- Consider Cloudflare (free tier) in front of the server for additional protection.

### 9. Data Privacy (GDPR / User Data)

**Risk**: LOW-MEDIUM — The server stores user email addresses and names from Google accounts, plus gate action audit logs.

**Mitigation**:
- Only store the minimum required data (email, name, role, approval status).
- Implement a user data export / deletion endpoint for compliance.
- Add a privacy policy if the app is distributed publicly.
- Audit logs should be rotated or archived periodically.

---

## Deployment Security Checklist

Use this checklist before going to production:

- [ ] **HTTPS enabled** — TLS certificate configured via Let's Encrypt / Caddy
- [ ] **`usesCleartextTraffic` removed** from `app.json` (after HTTPS is confirmed)
- [ ] **Strong JWT_SECRET** — at least 32 random characters
- [ ] **Per-device tokens** — generated automatically via admin API (no manual shared secret)
- [ ] **Firewall rules** — only ports 22 (SSH), 80, 443 open on the cloud VM
- [ ] **Port 3000 closed** — server only accessible via reverse proxy
- [ ] **SSH key auth** — disable password SSH login on the cloud VM
- [ ] **`.env` not in git** — verified in `.gitignore`
- [ ] **No secrets in source code** — config files use placeholders in the repo
- [ ] **Admin email set** — `ADMIN_EMAIL` in `.env` points to your Google account
- [ ] **Rate limiting active** — auth + global rate limits enabled
- [ ] **PM2 or systemd** — server auto-restarts on crash or reboot
- [ ] **Backups** — SQLite database backed up periodically (cron + cp)
- [ ] **Monitoring** — `/health` endpoint checked by uptime monitor

---

## Google Cloud Free Tier — Security Notes

When deploying on Google Cloud Platform (GCP) Always Free tier:

### Network Security
- **GCP Firewall Rules** control inbound/outbound traffic. By default, only SSH (port 22) and ICMP are open.
- You must explicitly add firewall rules for ports 80 and 443.
- **Do NOT open port 3000 directly** — use a reverse proxy instead.
- Your home IP is never exposed; all traffic goes to Google's public IP.

### VM Security
- Use SSH key authentication (GCP creates this during VM setup, or use `gcloud compute ssh`).
- Disable password-based SSH login:
  ```bash
  sudo sed -i 's/PasswordAuthentication yes/PasswordAuthentication no/' /etc/ssh/sshd_config
  sudo systemctl restart sshd
  ```
- Keep the OS updated: `sudo apt update && sudo apt upgrade -y`
- Google provides automatic security patches on supported OS images.

### Data Security
- The SQLite database file lives on the VM's persistent disk.
- Persistent disks are encrypted at rest by default on Google Cloud.
- Set up a cron job to back up the database:
  ```bash
  # Daily backup at 2 AM
  0 2 * * * cp /home/ubuntu/Gate-automation/server/prisma/prod.db /home/ubuntu/backups/prod-$(date +\%F).db
  ```

### Always Free Limitations
- **US regions only** — The e2-micro is only free in us-west1, us-central1, and us-east1. Latency from NZ is ~150ms.
- **1 GB egress/month** — Free outbound data is limited. API payloads are small so this is sufficient for normal use.
- **No SLA on free tier** — Google can change free tier terms. Mitigation: the server is a standard Node.js app, easily migrated.
- **After 90-day trial** — $300 trial credits expire but always-free resources continue at no cost. Google will NOT auto-charge.

---

## Future Security Improvements

| Priority | Improvement | Description |
|----------|------------|-------------|
| High | HTTPS everywhere | TLS via Let's Encrypt + Caddy/Nginx |
| High | Helmet middleware | HTTP security headers |
| Medium | Token refresh | Short-lived access tokens + refresh tokens |
| ~~Medium~~ | ~~Per-device keys~~ | ✅ **Implemented** — Each device gets a unique auto-generated token via `POST /admin/devices` |
| Medium | WebSocket TLS | WSS instead of WS for Arduino ↔ Server |
| Low | EEPROM encryption | Encrypt credentials stored on Arduino |
| Low | 2FA | Optional two-factor auth for admin actions |
| Low | IP allowlisting | Restrict admin endpoints to known IPs |
