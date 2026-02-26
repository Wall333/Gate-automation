# ADR 0002: Hosting on Google Cloud Free Tier

**Status:** Accepted  
**Date:** 2026-02-27

## Context

The Gate Controller server needs to be accessible from anywhere — not just the local network. When the mobile app is on mobile data or a different WiFi network, it must still be able to reach the server to send gate commands. Similarly, the Arduino device needs a stable, always-on server to maintain its WebSocket connection.

Running the server on a local PC has several problems:
- Only reachable on the local network (requires port forwarding + dynamic DNS for remote access)
- Exposes the home IP address to the internet
- Server stops when the PC is off or sleeping
- Windows Firewall and NAT add friction

We evaluated the following hosting options:

| Option | Cost | Always On | Home IP Hidden | Complexity | Verdict |
|--------|------|-----------|---------------|------------|---------|
| **Google Cloud Free Tier** | Free forever | Yes | Yes | Medium | **Selected** |
| Oracle Cloud Free Tier | Free forever | Yes | Yes | Medium | Sign-up rejected our account |
| AWS Free Tier | Free 12 months, then ~$42-181/yr | Yes | Yes | High | Not free long-term |
| Fly.io | Requires card, limited free tier | Yes | Yes | Low | Not truly free |
| Cloudflare Tunnel | Free (needs domain ~$10/yr) | Only if PC is on | Yes | Medium | PC must be on |
| Tailscale | Free | Only if PC is on | Yes | Low | PC must be on |
| Port Forwarding + DDNS | Free | Only if PC is on | **No** | Low | Exposes home IP |
| Render Free Tier | Free, no card | No (spins down) | Yes | Low | WebSocket disconnects on sleep |
| Railway | ~$5/mo | Yes | Yes | Low | Recurring cost |

## Decision

Use **Google Cloud Platform (GCP) Always Free Tier** to host the server.

### What Google Cloud Free Tier Provides

| Resource | Free Allocation | Notes |
|----------|----------------|-------|
| Compute (e2-micro) | 1 instance, 0.25 vCPU, 1 GB RAM | US regions only (Oregon, Iowa, South Carolina) |
| Boot Disk | 30 GB standard persistent disk | Included with instance |
| Outbound Data | 1 GB/month to non-Google destinations | More than enough for API traffic |
| Cloud Storage | 5 GB | For backups if needed |
| $300 Trial Credits | 90 days | For experimenting with non-free resources |

For this project, a single **e2-micro** instance with 1 GB RAM is sufficient for the Node.js + SQLite server.

## Rationale

### Why Google Cloud Free Tier?

1. **Free forever** — The e2-micro instance is part of Google's Always Free tier. It doesn't expire after 12 months like AWS. After the 90-day trial period, the always-free resources continue at no cost and Google will **not** auto-charge your card.

2. **Always-on server** — The VM runs 24/7 in Google's data center, independent of the developer's PC. The Arduino maintains a persistent WebSocket connection, and the mobile app can send commands at any time.

3. **Home IP not exposed** — All traffic goes to Google's public IP. The developer's home network is never revealed to the internet.

4. **Reliable sign-up** — Unlike Oracle Cloud (which rejected our account), Google Cloud sign-up is straightforward and widely accessible. The same Google account used for OAuth can manage the cloud project.

5. **Sufficient resources** — The e2-micro instance (0.25 vCPU, 1 GB RAM) is enough for a Node.js + SQLite server handling a small number of concurrent users. The server uses ~30-50 MB of RAM.

6. **Public IP included** — A static external IP can be assigned for free (while attached to a running instance), so the app and Arduino can connect directly.

7. **Future growth path** — If the project outgrows the free tier, Google Cloud has a clear upgrade path to larger instances, managed databases, and load balancers.

### Why Not the Alternatives?

- **Oracle Cloud** — The most generous free tier, but account sign-up was rejected. Known for difficult/unreliable registration process.
- **AWS** — Free for only 12 months. After that, the cheapest option (Lightsail) costs ~$42/year. Not justifiable for a hobby project.
- **Fly.io** — Advertised as free but requires a credit card and the free allowance has become very limited.
- **Cloudflare Tunnel / Tailscale** — Require the developer's PC to be running 24/7. Not suitable for a gate controller that needs constant availability.
- **Port Forwarding** — Exposes home IP address, requires dynamic DNS setup, and router configuration varies by model.
- **Render Free Tier** — No card required, but the service spins down after 15 minutes of inactivity (~30s cold starts). The Arduino's WebSocket connection would drop constantly.
- **Railway / DigitalOcean** — Good options but cost ~$5/month. Can't justify recurring costs for a test project.

### Known Limitations

- **US regions only for free tier** — The e2-micro is only free in `us-west1` (Oregon), `us-central1` (Iowa), and `us-east1` (South Carolina). From New Zealand, latency is ~150ms. This is perfectly acceptable for toggling a gate (not a real-time game).
- **Limited resources** — 0.25 vCPU and 1 GB RAM. Sufficient for current needs but would need upgrading for hundreds of concurrent users.
- **No managed Node.js** — Unlike Render/Railway, you must install and manage Node.js yourself. Mitigated by using PM2 for process management and auto-restart.
- **1 GB egress limit** — Free outbound data is limited to 1 GB/month. API responses are tiny (JSON payloads), so this is more than enough. If it becomes an issue, Cloudflare can be placed in front.
- **30 GB disk** — Enough for the OS, Node.js, and SQLite database. For reference, a fresh Ubuntu + Node.js install uses ~5 GB, and the database will stay under 1 MB for a long time.

## Implementation

### Server Configuration

- **OS**: Ubuntu 22.04 LTS (or latest LTS) — Google-provided image
- **Machine type**: e2-micro (0.25 vCPU, 1 GB RAM)
- **Region**: us-west1 (Oregon) — best latency to NZ among free regions
- **Boot disk**: 30 GB standard persistent disk
- **Network**: External IP assigned, firewall rules open ports 22 (SSH), 80 (HTTP), 443 (HTTPS)
- **Port 3000**: NOT exposed directly — use Caddy or Nginx as reverse proxy with HTTPS

### Deployment Flow

```
Developer PC                     Google Cloud VM
     │                                │
     │  git push to GitHub             │
     │──────────────────►              │
     │                    git pull     │
     │                    npm install  │
     │                    pm2 restart  │
     │                                │
     │         Ready to serve         │
     │◄───────────────────────────────│
```

### Security Configuration

1. SSH key authentication only (password login disabled)
2. GCP Firewall Rules: only ports 22, 80, 443 open
3. Reverse proxy (Caddy) handles HTTPS automatically via Let's Encrypt
4. Server binds to localhost:3000, only accessible via reverse proxy
5. UFW firewall on the VM as additional layer

See [SECURITY.md](../SECURITY.md) for the full security guide.

## Consequences

- The project depends on Google maintaining the Always Free tier. If Google discontinues it, migration to another provider is straightforward since the server is a standard Node.js app.
- Latency from New Zealand to US-West is ~150ms. This is acceptable for gate control but noticeable compared to a local or Australian server.
- Developers need basic Linux/SSH skills for server management.
- Deployment is manual (git pull + pm2 restart). CI/CD can be added later if needed.
- The SQLite database lives on the VM's persistent disk. Regular backups are essential.
- A domain name (~$10/year) is recommended for HTTPS but not strictly required (can use the raw IP with a self-signed certificate for testing).
