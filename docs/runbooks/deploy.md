# Deployment Runbook

This document outlines the steps taken to deploy the Gate Controller server to Google Cloud Platform (GCP) Free Tier.

## Infrastructure Setup

### Google Cloud Account
- **Account**: your-email@gmail.com
- **Project**: gate-controller
- **Free tier**: $300 trial credits for 90 days + Always Free resources (no charge after trial)

### VM Instance Details

| Setting | Value |
|---------|-------|
| **Name** | gate-server |
| **Region / Zone** | us-west1 (Oregon) |
| **Machine type** | f1-micro (0.2 vCPU, 614 MB RAM) — Always Free |
| **Boot disk** | Ubuntu 22.04 LTS x86/64, 30 GB Standard persistent disk |
| **External IP** | <YOUR_VM_EXTERNAL_IP> |
| **Firewall** | HTTP + HTTPS traffic allowed |

> **Why f1-micro?** It's the Always Free eligible instance type on GCP. The e2-micro shows a cost estimate and may not be covered. f1-micro shows no cost = confirmed free.

> **Why us-west1?** GCP free tier VMs are only available in US regions (us-west1, us-central1, us-east1). Oregon was chosen for lowest latency to New Zealand (~150ms).

### Cost: $0/month
The f1-micro instance, 30 GB standard disk, and 1 GB egress are all covered by the Always Free tier. No charges after the 90-day trial ends.

## Deployment Steps (What We Did)

### Step 1: Created the VM

1. Went to **console.cloud.google.com**
2. Created project **gate-controller**
3. Enabled **Compute Engine API**
4. Created instance:
   - Name: `gate-server`
   - Region: `us-west1-b`
   - Machine type: `f1-micro`
   - Boot disk: Ubuntu 22.04 LTS x86/64, 30 GB Standard persistent disk
   - Firewall: ✅ Allow HTTP, ✅ Allow HTTPS
5. VM started with external IP: `<YOUR_VM_EXTERNAL_IP>`

### Step 2: SSH into the VM

Clicked **SSH** button in the GCP Console to open a browser-based terminal.

### Step 3: Installed Node.js

```bash
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt-get install -y nodejs
sudo apt install -y npm
```

Verified:
```bash
node --version   # v20.x
npm --version    # 10.x
```

### Step 4: Clone the Repository

```bash
git clone https://github.com/Wall333/Gate-automation.git
cd Gate-automation/server
npm install --omit=dev
```

### Step 5: Configure Environment

```bash
cp .env.example .env
nano .env
```

Fill in production values:
```
PORT=3000
JWT_SECRET=<generate with: node -e "console.log(require('crypto').randomBytes(32).toString('hex'))">
GOOGLE_CLIENT_ID=<your Google OAuth client ID>
ADMIN_EMAIL=<your admin email>
DATABASE_URL=file:./prod.db
```

> **Note:** `DEVICE_TOKEN` is no longer needed as a server environment variable. Device tokens are now auto-generated per device via the mobile app's "Add Device" flow (which calls `POST /admin/devices`).

### Step 6: Run Database Migration

```bash
npx prisma migrate deploy
```

### Step 7: Install PM2 and Start Server

```bash
sudo npm install -g pm2
pm2 start index.js --name gate-server
pm2 save
pm2 startup
```

(Run the command that `pm2 startup` outputs with `sudo`)

### Step 8: Open Port 3000 in VM Firewall

```bash
sudo ufw allow 22
sudo ufw allow 80
sudo ufw allow 443
sudo ufw allow 3000
sudo ufw enable
```

> **Note**: Port 3000 is open temporarily for testing. Once a reverse proxy (Caddy/Nginx) is set up with HTTPS, close port 3000 and only allow 80/443.

### Step 9: Verify

```bash
curl http://localhost:3000/health
# Expected: {"status":"ok","timestamp":"..."}
```

From any browser or phone:
```
http://<YOUR_VM_EXTERNAL_IP>:3000/health
```

### Step 10: Update Mobile App Config

Update `mobile/src/config.js`:
```js
SERVER_URL: 'http://<YOUR_VM_EXTERNAL_IP>:3000',
```

Rebuild APK with EAS to test.

## GCP Firewall Rules (Network Level)

The "Allow HTTP/HTTPS traffic" checkboxes during VM creation added these GCP firewall rules:
- `default-allow-http` — TCP port 80 from 0.0.0.0/0
- `default-allow-https` — TCP port 443 from 0.0.0.0/0

To also allow port 3000 (for testing before reverse proxy):
1. Go to **VPC Network** → **Firewall** → **Create Firewall Rule**
2. Name: `allow-node-3000`
3. Direction: Ingress
4. Targets: All instances
5. Source IP ranges: `0.0.0.0/0`
6. Protocols: TCP, port `3000`
7. Click **Create**

## Future Steps

- [ ] Set up Caddy reverse proxy for HTTPS (Let's Encrypt)
- [ ] Close port 3000 after reverse proxy is configured
- [ ] Add a domain name (optional, ~$10/year)
- [ ] Remove `usesCleartextTraffic: true` from app.json after HTTPS
- [ ] Set up daily database backups (cron job)
- [ ] Disable SSH password login

## Rollback

1. Stop the server: `pm2 stop gate-server`
2. Check out the previous known-good commit: `git checkout <commit-hash>`
3. Run `npm install --omit=dev` and `npx prisma migrate deploy`
4. Restart: `pm2 restart gate-server`

## Monitoring

- Check `/health` endpoint periodically (uptime monitor)
- Review audit logs via `GET /admin/audit`
- Monitor device connectivity via `GET /gate/status`
- List registered devices via `GET /admin/devices`
- Check PM2 status: `pm2 status` / `pm2 logs gate-server`
