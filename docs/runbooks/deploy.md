# Deployment Runbook

This document outlines the steps to deploy the Gate Controller server to a production environment.

## Prerequisites

- A VPS, cloud VM, or platform-as-a-service (e.g. Render, Railway, DigitalOcean).
- Node.js ≥ 18 installed on the target machine.
- A domain or public IP with HTTPS configured (reverse proxy via Nginx, Caddy, or the platform's built-in TLS).
- A Google OAuth 2.0 client ID configured for the production domain.

## Environment Variables

Copy `.env.example` to `.env` on the server and fill in production values:

```
PORT=3000
JWT_SECRET=<generate a strong random string>
GOOGLE_CLIENT_ID=<production Google OAuth client ID>
ADMIN_EMAIL=<admin's Google email>
DEVICE_TOKEN=<generate a strong random string, share with Arduino>
DATABASE_URL=file:./prod.db
```

> **Security:** Never commit `.env` to version control.

## Deployment Steps

### 1. Clone and Install

```bash
git clone https://github.com/Wall333/Gate-automation.git
cd Gate-automation/server
npm install --omit=dev
```

### 2. Database Migration

```bash
npx prisma migrate deploy
```

This applies all pending migrations to the production database.

### 3. Start the Server

```bash
npm start
```

For process management, use PM2 or systemd:

```bash
# PM2
npm install -g pm2
pm2 start index.js --name gate-server
pm2 save
pm2 startup

# Or systemd (create a service file)
```

### 4. Verify Health

```bash
curl https://<your-domain>/health
# Expected: {"status":"ok","timestamp":"..."}
```

### 5. Configure Reverse Proxy (if applicable)

Set up Nginx or Caddy to:
- Terminate TLS (HTTPS)
- Proxy HTTP requests to `localhost:3000`
- Proxy WebSocket connections (`Upgrade` header) to `localhost:3000`

Example Nginx snippet:

```nginx
location / {
    proxy_pass http://127.0.0.1:3000;
    proxy_http_version 1.1;
    proxy_set_header Upgrade $http_upgrade;
    proxy_set_header Connection "upgrade";
    proxy_set_header Host $host;
}
```

### 6. Arduino Configuration

Upload the sketch to the Arduino UNO R4 WiFi board via Arduino IDE.

On first boot, the Arduino starts as a WiFi Access Point named **GateController** (password: `gatesetup`). Use the mobile app → Settings → Add Device to provision:
- WiFi SSID and password for the production network
- Production server host and port (e.g., `yourdomain.com`, `443`)
- The same `DEVICE_TOKEN` used in the server `.env`

Config is stored in the board's EEPROM — no secrets in source code. To reconfigure, factory-reset by holding pin 3 LOW during boot.

## Rollback

1. Stop the server (`pm2 stop gate-server` or `systemctl stop gate-server`).
2. Check out the previous known-good commit.
3. Run `npm install --omit=dev` and `npx prisma migrate deploy`.
4. Restart the server.

## Monitoring

- Check `/health` endpoint periodically (uptime monitor).
- Review audit logs via `GET /admin/audit` or direct database queries.
- Monitor device connectivity via `GET /gate/status`.
