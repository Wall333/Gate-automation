# Changelog

All notable changes to the Gate Controller project are documented here.

---

## [v1.1.0] — 2026-02-27

### Added
- **Per-device token generation** — Each device now gets a unique authentication token auto-generated via `POST /admin/devices`. Replaces the old single shared `DEVICE_TOKEN` environment variable.
- **`POST /admin/devices`** — Server endpoint to register a new device and return a one-time raw token (bcrypt-hashed in DB).
- **`GET /admin/devices`** — Server endpoint to list all registered devices.
- **`DELETE /admin/devices/:id`** — Server endpoint to remove a device and its associated audit logs.
- **Delete device UI** — Admin users see a red ✕ button on each device card (+ long-press) with a confirmation dialog.
- **`deleteDevice()` API function** — Mobile client function for the delete endpoint.
- **Auto-detect WiFi SSID** — The Add Device screen auto-detects the phone's current WiFi name using `react-native-wifi-reborn` (requires location permission on Android).
- **Auto-fill server host/port** — Server connection details are pre-filled from `Config.SERVER_URL` and hidden behind a collapsible "Advanced Settings" section.
- **Two-phase provisioning wizard** — Step 1: register device on server (while on home WiFi). Step 2: switch to Arduino AP and send config. Fixes the "Network request failed" error caused by trying to reach the cloud server while connected to the Arduino's offline AP.
- **Device name field** — Users can optionally name the device (defaults to "Gate Controller").
- **Network security config plugin** — Expo config plugin (`withNetworkSecurityConfig.js`) that generates Android `network_security_config.xml` allowing cleartext HTTP traffic, fixing the Google Sign-In "Network request failed" issue.
- **Custom app icon** — Gate-themed icon (pillars + arch + bars) replacing the default Expo icon.
- **App renamed** — From "mobile" to "Gate Controller".
- **Sign-in screen icon** — Shows the app icon image instead of a 🔒 emoji.

### Changed
- **AddDeviceScreen.js** — Complete rewrite: simplified from 5 manual fields to 2 (WiFi password + optional device name), with two-phase wizard flow.
- **DevicesScreen.js** — Added delete button and long-press handler for admin users.
- **admin.js** — Added `crypto` and `bcrypt` imports; added device CRUD endpoints.
- **api.js** — Added `registerDevice()` and `deleteDevice()` functions.
- **Password field** — Added `autoComplete="off"`, `textContentType="none"`, `autoCorrect={false}` to fix missing asterisks on some Android devices.

### Documentation Updates
- **MVP spec (v1.1)** — Added endpoints 7.8–7.10 (`POST/GET/DELETE /admin/devices`), updated device auth description, updated env vars table (removed `DEVICE_TOKEN`), updated Phase 4 step 18, added test scenarios 12–17.
- **SECURITY.md** — Rewrote Risk #4 for per-device tokens, updated deployment checklist, marked "Per-device keys" as implemented.
- **README.md** — Updated device auth and getting-started descriptions.
- **DEVELOPMENT.md** — Replaced manual provisioning description with auto-fill flow.
- **deploy.md** — Removed `DEVICE_TOKEN` from `.env` template, added note about auto-generation, added `/admin/devices` to monitoring section.

### Fixed
- **"Network request failed" during provisioning** — App tried to reach cloud server while on Arduino AP (no internet). Fixed with two-phase flow.
- **Google Sign-In "Network request failed"** — Android blocked cleartext HTTP from fetch. Fixed with `network_security_config.xml` Expo plugin.
- **WiFi password field not showing asterisks** — Added proper `autoComplete`/`textContentType` props.
- **Arduino `strlcpy` compilation error** — Replaced with `strncpy` + manual null termination.

---

## [v1.0.0] — 2026-02-26

### Added
- Initial MVP release.
- **Server**: Express 5, Prisma + SQLite, Google OAuth verification, JWT auth, WebSocket device manager, admin approval flow, audit logging, rate limiting.
- **Mobile**: Expo SDK 54, React Native, Google Sign-In, device list, toggle gate, admin user management.
- **Arduino**: UNO R4 WiFi sketch with AP provisioning mode, EEPROM config storage, WebSocket client, heartbeat, relay control, factory reset.
- **Deployment**: GCP f1-micro VM (Always Free), PM2 process manager, systemd startup.
- **Documentation**: MVP spec, security guide, deployment runbook, ADRs, contributing guide.
