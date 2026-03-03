# MVP Gate Controller — Specification v1

## 1. Overview

Build a minimum viable gate controller that allows approved users to remotely toggle a gate from a mobile app. The system consists of three components: a Node.js server, a React Native mobile app, and an Arduino UNO R4 WiFi with a relay module.

**MVP scope:**
- One gate, one device
- Single action: TOGGLE (momentary relay pulse)
- Google Sign-In authentication
- Admin-approved authorization
- Audit logging of every gate action
- Device online/offline status
- Gate open/closed state detection via reed switch
- Real-time gate state updates to app clients via WebSocket
- Over-the-air firmware updates (admin uploads `.ota` file, pushes to device)

**Out of scope (future):**
- Multiple gates
- Guest links / timed access
- Push notifications, geofencing, BLE
- Auto-close timer

---

## 2. Architecture

```
┌──────────────────┐        HTTPS / REST         ┌──────────────────┐
│   React Native   │◄──────────────────────────►│   Node.js Server  │
│    Mobile App    │                             │    (Express)      │
└──────────────────┘                             └────────┬─────────┘
        │                                                 │
        │  Google OAuth 2.0                               │  WebSocket (persistent,
        │  (ID token sent to server)                      │   outbound from device)
        ▼                                                 ▼
┌──────────────────┐                             ┌──────────────────┐
│   Google Auth    │                             │  Arduino UNO R4  │
│   (identity)     │                             │  WiFi + Relay    │
└──────────────────┘                             └──────────────────┘
                                                          │
                                                          ▼
                                                   ┌────────────┐
                                                   │    Gate     │
                                                   └────────────┘
```

### Component Responsibilities

| Component | Role |
|-----------|------|
| **Mobile App** | Google sign-in, display gate status (online/offline), TOGGLE button, admin panel (approve/deny users), firmware upload & OTA trigger |
| **Node.js Server** | Verify Google ID token, issue JWT, enforce approval, relay TOGGLE commands to Arduino via WebSocket, audit logging, firmware storage & OTA delivery |
| **Arduino UNO R4 WiFi** | Maintain outbound WebSocket to server, listen for TOGGLE command, pulse relay, send heartbeat, receive OTA updates via `OTAUpdate` library |

---

## 3. Authentication Flow

```
Mobile                      Server                       Google
  │                           │                             │
  │── Google Sign-In ────────►│                             │
  │   (obtain id_token)       │                             │
  │                           │── verify id_token ─────────►│
  │                           │◄─ token valid + user info ──│
  │                           │                             │
  │                           │  Upsert user record         │
  │                           │  (new → status: pending)    │
  │◄── JWT or "pending" ─────│                             │
```

1. User taps **Sign in with Google** → receives a Google `id_token`.
2. App sends `POST /auth/google` with `{ idToken }`.
3. Server verifies the token via `google-auth-library` (or Google's `tokeninfo` endpoint).
4. Server upserts the user record:
   - **New user** → `status: "pending"`, response: `{ approved: false }`.
   - **Existing approved user** → issue JWT, response: `{ approved: true, token }`.
5. JWT payload: `{ sub: <userId>, email, role, iat, exp }`.
6. JWT expiry: 7 days. Refresh by re-authenticating with Google.

---

## 4. Authorization Flow (Admin Approval)

1. The first admin is seeded automatically on server startup using the `ADMIN_EMAIL` environment variable.
2. Admin opens the **Users** tab in the app → calls `GET /admin/users`.
3. Admin taps **Approve** or **Deny** on a pending user → calls `POST /admin/users/:id/approve` or `POST /admin/users/:id/deny`.
4. On next sign-in, the newly approved user receives a JWT.

---

## 5. Device Communication

**Preferred approach: WebSocket (outbound from Arduino)**

The Arduino initiates and maintains a WebSocket connection to the server. This avoids NAT/port-forwarding issues since the device connects outward.

```
Arduino                           Server                          App
  │                                 │                               │
  │── WS connect + device_token ──►│  (authentication)              │
  │◄── "authenticated" ────────────│                               │
  │                                 │                               │
  │◄── { type: "TOGGLE" } ────────│  (server relays user request)  │
  │── { type: "ACK", ok: true } ──►│                               │
  │                                 │                               │
  │── { type: "HEARTBEAT" } ──────►│  (every 30 seconds)           │
  │◄── { type: "PONG" } ──────────│                               │
  │                                 │                               │
  │── { type: "GATE_STATE",  ─────►│  (reed switch change)         │
  │    isOpen: true/false }         │── broadcast GATE_STATE ──────►│
  │                                 │                               │
  │◄── { type: "OTA_UPDATE",  ────│  (admin triggers firmware push)│
  │    url: "http://..." }          │                               │
  │── { type: "OTA_STATUS",  ─────►│  (progress: downloading,      │
  │    status, message }            │   verifying, applying, error) │
  │                                 │── broadcast OTA_STATUS ──────►│
  │  (device reboots on success)    │                               │
```

**App-facing WebSocket (`/app/ws`):**
Mobile/web clients connect to `/app/ws` for real-time updates. The server broadcasts `GATE_STATE` and `OTA_STATUS` messages. No authentication is required on this endpoint (stateless broadcast).

- Server tracks `lastSeen` on each heartbeat.
- If no heartbeat received for 90 seconds → device marked offline.
- On disconnect → auto-reconnect with exponential backoff.

**Fallback: HTTP polling**

If WebSocket proves unreliable on the Arduino hardware, fall back to:
- `GET /device/commands?token=<device_token>` — Arduino polls every 2–5 seconds.
- Server queues pending commands and returns them on poll.

---

## 6. Data Model

### Users

| Column    | Type     | Notes |
|-----------|----------|-------|
| id        | UUID PK  | Auto-generated |
| email     | String   | From Google token, unique |
| name      | String   | From Google token |
| picture   | String   | Google avatar URL |
| role      | Enum     | `"user"` \| `"admin"` |
| status    | Enum     | `"pending"` \| `"approved"` \| `"denied"` |
| createdAt | DateTime | |
| updatedAt | DateTime | |

### Devices

| Column    | Type     | Notes |
|-----------|----------|-------|
| id        | UUID PK  | Auto-generated |
| name      | String   | e.g. "Front Gate" |
| tokenHash | String   | bcrypt hash of device token |
| isOnline  | Boolean  | Derived from lastSeen |
| isOpen    | Boolean  | Gate open/closed state from reed switch (default: false) |
| lastSeen  | DateTime | Updated on heartbeat |
| createdAt | DateTime | |

### AuditLog

| Column    | Type     | Notes |
|-----------|----------|-------|
| id        | UUID PK  | Auto-generated |
| userId    | UUID FK  | Who triggered the action |
| deviceId  | UUID FK  | Which device |
| action    | String   | `"TOGGLE"` |
| result    | String   | `"ACK"` \| `"TIMEOUT"` \| `"DEVICE_OFFLINE"` |
| timestamp | DateTime | |

### Firmware

| Column     | Type     | Notes |
|------------|----------|-------|
| id         | UUID PK  | Auto-generated |
| filename   | String   | Original upload filename |
| storedName | String   | Unique on-disk filename (UUID-based) |
| version    | String   | User-supplied version label (optional) |
| size       | Int      | File size in bytes |
| uploadedAt | DateTime | |

**Storage (MVP):** SQLite via Prisma ORM (can migrate to PostgreSQL later).

---

## 7. API Endpoints

### 7.1 `POST /auth/google`

Verify Google ID token, upsert user, return JWT if approved.

**Request:**
```json
{ "idToken": "<google-id-token>" }
```

**Response (approved):**
```json
{
  "approved": true,
  "token": "<jwt>",
  "user": { "id": "...", "email": "...", "name": "...", "role": "user" }
}
```

**Response (pending):**
```json
{
  "approved": false,
  "message": "Your account is pending admin approval."
}
```

### 7.2 `POST /gate/toggle`

Send a TOGGLE command to the connected device. Requires `Authorization: Bearer <jwt>` from an approved user.

**Request:**
```json
{ "deviceId": "<device-uuid>" }
```

**Response (success):**
```json
{ "ok": true, "action": "TOGGLE", "result": "ACK" }
```

**Response (device offline):**
```json
{ "ok": false, "action": "TOGGLE", "result": "DEVICE_OFFLINE" }
```

### 7.3 `GET /gate/status`

Return device online/offline status. Requires valid JWT.

**Response:**
```json
{
  "devices": [
    { "id": "...", "name": "Front Gate", "isOnline": true, "isOpen": false, "lastSeen": "2026-02-26T12:00:00Z" }
  ]
}
```

### 7.4 `GET /admin/users`

List all users. Requires `role: "admin"`. Supports optional query `?status=pending`.

**Response:**
```json
[
  { "id": "...", "email": "...", "name": "...", "status": "pending", "role": "user" }
]
```

### 7.5 `POST /admin/users/:id/approve`

Approve a pending user. Requires `role: "admin"`.

**Response:**
```json
{ "id": "...", "email": "...", "status": "approved" }
```

### 7.6 `POST /admin/users/:id/deny`

Deny a pending user. Requires `role: "admin"`.

**Response:**
```json
{ "id": "...", "email": "...", "status": "denied" }
```

### 7.6b `DELETE /admin/users/:id`

Permanently remove a user and all their associated audit logs. Requires `role: "admin"`. An admin cannot delete their own account.

**Response (200):**
```json
{ "message": "User deleted.", "id": "<user-uuid>" }
```

**Response (400):**
```json
{ "error": "You cannot delete your own account." }
```

**Response (404):**
```json
{ "error": "User not found." }
```

### 7.7 `GET /admin/audit`

List recent audit log entries. Requires `role: "admin"`.

**Response:**
```json
[
  { "id": "...", "userId": "...", "userEmail": "a@b.com", "action": "TOGGLE", "result": "ACK", "timestamp": "..." }
]
```

### 7.8 `POST /admin/devices`

Register a new device and generate a unique authentication token. Requires `role: "admin"`. The raw token is returned **once** — it cannot be retrieved again.

**Request:**
```json
{ "name": "Front Gate" }
```

**Response (201):**
```json
{
  "device": { "id": "...", "name": "Front Gate" },
  "token": "<64-char hex token>",
  "message": "Device created. Save the token — it cannot be retrieved again."
}
```

### 7.9 `GET /admin/devices`

List all registered devices. Requires `role: "admin"`.

**Response:**
```json
[
  { "id": "...", "name": "Front Gate", "isOnline": true, "lastSeen": "2026-02-27T12:00:00Z" }
]
```

### 7.10 `DELETE /admin/devices/:id`

Remove a registered device and its associated audit logs. Requires `role: "admin"`. The device will need to be factory-reset and re-provisioned to reconnect.

**Response (200):**
```json
{ "message": "Device deleted.", "id": "<device-uuid>" }
```

**Response (404):**
```json
{ "error": "Device not found." }
```

### 7.10b `PATCH /admin/devices/:id`

Update a device's editable properties. Currently supports renaming. Requires `role: "admin"`.

**Request body:**
```json
{ "name": "Front Gate" }
```

**Response (200):**
```json
{ "id": "<uuid>", "name": "Front Gate", "isOnline": true, "lastSeen": "...", "createdAt": "..." }
```

**Response (404):**
```json
{ "error": "Device not found." }
```

### 7.11 `WS /device/ws` (or `GET /device/commands` polling fallback)

WebSocket endpoint for Arduino device connection. Device authenticates by sending `{ type: "AUTH", token: "<device-token>" }` as the first message.

### 7.12 `POST /admin/firmware`

Upload a firmware file (`.bin` or `.ota`, max 2 MB). Requires `role: "admin"`. Uses `multipart/form-data`.

**Request:** `Content-Type: multipart/form-data` with field `firmware` (file) and optional field `version` (string).

**Response (201):**
```json
{ "id": "...", "filename": "gate_controller.ota", "storedName": "<uuid>.ota", "version": "1.4.0", "size": 48320, "uploadedAt": "..." }
```

### 7.13 `GET /admin/firmware`

List all uploaded firmware files. Requires `role: "admin"`.

**Response:**
```json
[
  { "id": "...", "filename": "gate_controller.ota", "storedName": "<uuid>.ota", "version": "1.4.0", "size": 48320, "uploadedAt": "..." }
]
```

### 7.14 `DELETE /admin/firmware/:id`

Delete a firmware file from disk and database. Requires `role: "admin"`.

**Response (200):**
```json
{ "message": "Firmware deleted.", "id": "<uuid>" }
```

### 7.15 `GET /firmware/download/:storedName`

Serve a firmware file for download. **No authentication** — the Arduino fetches this URL during OTA. The `storedName` acts as an unguessable token (UUID).

**Response:** Binary file stream with `Content-Disposition: attachment`.

### 7.16 `POST /admin/devices/:id/ota`

Trigger an OTA update on a connected device. Requires `role: "admin"`. Sends an `OTA_UPDATE` WebSocket message to the device with the firmware download URL.

**Request:**
```json
{ "firmwareId": "<firmware-uuid>" }
```

**Response (200):**
```json
{ "ok": true, "message": "OTA update triggered." }
```

**Response (device offline):**
```json
{ "ok": false, "error": "Device is not connected." }
```

---

## 8. Security Notes

| Concern | Approach |
|---------|----------|
| Google token verification | Use `google-auth-library` server-side; never trust client-only claims |
| JWT signing | HS256 with `JWT_SECRET` env var; 7-day expiry |
| Device authentication | Per-device unique token, auto-generated via `POST /admin/devices`; bcrypt-hashed in DB; sent at WS handshake |
| Transport security | All traffic over HTTPS/WSS in production (reverse proxy or cloud provider) |
| Rate limiting | `express-rate-limit`: 5 req/min on `/auth/google`, 20 req/min on `/gate/toggle` |
| Audit logging | Every TOGGLE attempt logged with user, device, result, timestamp |
| Secrets management | All secrets in `.env`; `.env` listed in `.gitignore`; template in `.env.example` |
| CORS | Restrict origins in production; permissive in dev |
| Input validation | Validate all request bodies with `zod` schemas |

### Required Environment Variables

| Variable | Component | Description |
|----------|-----------|-------------|
| `PORT` | Server | HTTP listen port (default 3000) |
| `JWT_SECRET` | Server | Secret for signing JWTs |
| `GOOGLE_CLIENT_ID` | Server | Google OAuth client ID |
| `ADMIN_EMAIL` | Server | Email of the first admin (seeded on startup) |
| `DATABASE_URL` | Server | Prisma connection string (e.g. `file:./dev.db`) |
| _(Device token)_ | Arduino (EEPROM) | Auto-generated per device via `POST /admin/devices`, provisioned to Arduino by the mobile app |
| _(WiFi SSID)_ | Arduino (EEPROM) | Auto-detected from phone's current WiFi, provisioned via mobile app |
| _(WiFi password)_ | Arduino (EEPROM) | Entered by user during provisioning, stored in EEPROM |
| _(Server host/port)_ | Arduino (EEPROM) | Auto-filled from mobile app config, stored in EEPROM |

> **Note:** `DEVICE_TOKEN` is no longer a server environment variable. Device tokens are now generated per-device via the admin API and stored as bcrypt hashes in the database.

---

## 9. Implementation Plan

### Phase 1 — Server Foundation
1. Initialize Node.js project in `/server`; install Express, dotenv, cors, zod.
2. Set up Prisma with SQLite; define User, Device, AuditLog models; run migration.
3. Implement `POST /auth/google` — verify token, upsert user, issue JWT.
4. Add JWT auth middleware for protected routes.
5. Implement admin routes: `GET /admin/users`, `POST /admin/users/:id/approve`, `POST /admin/users/:id/deny`, `DELETE /admin/users/:id`.
6. Seed first admin user on startup from `ADMIN_EMAIL`.

### Phase 2 — Device Communication
7. Add WebSocket server (`ws` library); handle device auth, heartbeat, TOGGLE relay.
8. Implement `POST /gate/toggle` — verify user approved, relay to device, log result.
9. Implement `GET /gate/status` — return device online/offline + lastSeen.
10. Implement `GET /admin/audit` — return recent audit entries.

### Phase 3 — Arduino Sketch
11. Arduino sketch: provisioning mode (WiFi AP + HTTP config server), EEPROM storage, factory-reset pin.
12. Normal mode: read config from EEPROM, WiFi connect, WebSocket client, authenticate with device token.
13. Handle incoming TOGGLE → momentary relay pulse (1 s) → send ACK. Send HEARTBEAT every 30 s; auto-reconnect on disconnect. Show heart on built-in 12×8 LED matrix when authenticated; clear on disconnect.
13b. Read reed switch on pin D4 (INPUT_PULLUP, debounced 100 ms). On state change, send `{ type: "GATE_STATE", isOpen: true/false }` to server. LOW = gate closed (magnet near), HIGH = gate open.

### Phase 4 — Mobile App
14. Initialize React Native project in `/mobile`; install navigation, secure storage, Google Sign-In.
15. Build **Sign-In screen**: Google login → `POST /auth/google` → store JWT in secure storage. Show "Pending approval" message if not yet approved.
16. Build **Devices screen** (approved users): lists all devices from `GET /gate/status` with online/offline indicator. Tap a device → opens Device Detail. Long-press a device → shows options menu ("Device Settings" / "Remove Device"). Admin sees **[+ Add Device]** FAB.
17. Build **Device Detail screen**: shows device name, online/offline status, last-seen timestamp, a ⚙️ settings button, and a **toggle switch button** that calls `POST /gate/toggle`.
17b. Build **Device Settings screen**: shows device info (name, ID, status, last seen, created), server connection details (host, port, WebSocket endpoint), network/provisioning info. Device name is editable inline (tap ✎ → edit → Save). Admin can remove device from this screen.
18. Build **Add Device screen** (admin only): connect to Arduino's provisioning AP ("GateController"). The app auto-detects the phone's WiFi SSID (via `react-native-wifi-reborn`), auto-fills server host/port from `Config.SERVER_URL`, and auto-generates a unique device token by calling `POST /admin/devices`. User only needs to enter the WiFi password and optionally rename the device. On submit, the app POSTs config to the Arduino's `/configure` endpoint. On success, device appears in Devices list. If the user leaves the wizard before completing Arduino configuration, the registered device is automatically cleaned up from the server.
19. Build **Users screen** (admin only): list all users from `GET /admin/users`, approve/deny buttons, **remove user** button (non-admin users only, with confirmation), audit log from `GET /admin/audit`.

**Screen map:**
```
Sign In (Google)
    │
    ├─ [pending user] → "Awaiting admin approval" message
    │
    └─ [approved user] → Devices list
                            │
                            ├── Tap device → Device Detail (status + TOGGLE)
                            │
                            ├── [+ Add Device] (admin only) → Add Device screen
                            │
                            └── [Users] tab (admin only) → Users + Audit log
```

### Phase 5 — Over-the-Air Updates
20. Add Firmware model to Prisma schema; run migration.
21. Create firmware routes: upload (`multer`), list, delete, download (no auth), trigger OTA.
22. Add `sendOTAUpdate` to `deviceManager.js`; handle `OTA_STATUS` messages from device → broadcast to app clients.
23. Arduino: add `OTAUpdate` library handler — receive `OTA_UPDATE`, download `.ota` file, verify, apply, reboot.
24. Mobile: firmware upload via `expo-document-picker`, firmware list with push buttons, OTA status banner via WebSocket.
25. Create `tools/bin2ota.py` conversion script (LZSS compression + CRC32 + magic header).

### Phase 6 — Integration & Hardening
26. End-to-end test: sign in → approve → toggle → verify audit log.
27. Add rate limiting, input validation, error handling polish.
28. Write deployment runbook and finalize README.

---

## 10. Test Plan

| # | Scenario | Method | Expected Result |
|---|----------|--------|-----------------|
| 1 | Invalid Google token rejected | `POST /auth/google` with bad token | 401 Unauthorized |
| 2 | New user gets pending status | `POST /auth/google` with valid token, new email | `{ approved: false }` |
| 3 | Admin can list users | `GET /admin/users` with admin JWT | 200 + user list |
| 4 | Admin can approve user | `POST /admin/users/:id/approve` | status → approved |
| 5 | Approved user receives JWT | `POST /auth/google` after approval | `{ approved: true, token }` |
| 6 | Pending user cannot toggle | `POST /gate/toggle` with pending JWT | 403 Forbidden |
| 7 | Approved user toggles gate | `POST /gate/toggle` with approved JWT, device online | `{ ok: true, result: "ACK" }` |
| 8 | Toggle is audit-logged | `GET /admin/audit` after toggle | Entry present |
| 9 | Toggle fails when device offline | Disconnect device, then toggle | `{ ok: false, result: "DEVICE_OFFLINE" }` |
| 10 | Heartbeat updates lastSeen | Send heartbeat from device | `lastSeen` updated in DB |
| 11 | Rate limiter triggers | 21 rapid toggle requests | 429 Too Many Requests |
| 12 | Admin can register a device | `POST /admin/devices` with name | 201 + device ID + raw token |
| 13 | Admin can list devices | `GET /admin/devices` with admin JWT | 200 + device list |
| 14 | Auto-generated token works for WS auth | Register device, use token in WS AUTH message | Device authenticated |
| 15 | Simplified provisioning flow | Add Device screen auto-fills SSID, server, generates token | Arduino receives valid config |
| 16 | Admin can delete a device | `DELETE /admin/devices/:id` with admin JWT | 200 + device removed from DB |
| 17 | Deleting device cleans up audit logs | Delete device, check audit logs | Associated logs removed |
| 18 | Admin can rename a device | `PATCH /admin/devices/:id` with `{ name: "New Name" }` | 200 + updated device |
| 19 | Abandoned provisioning cleans up | Start Add Device, go back before Arduino config | Registered device auto-deleted |
| 20 | Admin can delete a user | `DELETE /admin/users/:id` with admin JWT | 200 + user and audit logs removed |
| 21 | Deleting user cleans up audit logs | Delete user, check audit logs | Associated logs removed |
| 22 | Admin cannot self-delete | `DELETE /admin/users/:id` with own ID | 400 error |
| 23 | Admin can upload firmware | `POST /admin/firmware` with .bin/.ota file | 201 + firmware record |
| 24 | Admin can list firmware | `GET /admin/firmware` | Array of firmware records |
| 25 | Admin can trigger OTA | `POST /admin/devices/:id/ota` with `{ firmwareId }` | OTA_UPDATE sent to device |
| 26 | Device downloads firmware | OTA_UPDATE received → downloads from URL | OTA_STATUS messages sent |
| 27 | App shows OTA progress | OTA_STATUS broadcast received | UI shows status banner |

---

*Spec version: v1.4.0 — March 3, 2026*
