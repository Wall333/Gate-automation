# Changelog

All notable changes to the Gate Controller project are documented here.

---

## [v1.2.3] — 2026-03-01

### Fixed
- **Device token truncation** — The EEPROM token buffer was 64 bytes but the server generates 64-char hex tokens (needs 65 bytes with null terminator). This caused authentication to always fail. Bumped `deviceToken` from `char[64]` to `char[65]`.
- **WiFi not connecting after provisioning** — The ESP32 WiFi co-processor could stay in AP mode after MCU reset. Added `WiFi.disconnect()` + `WiFi.end()` before `WiFi.begin()` to ensure a clean station-mode connection.
- **Provisioning soft-lock** — The "Send Configuration to Arduino" step now blocks back navigation (both gesture/hardware back and the "← Back to form" link) while the config is being sent, preventing errors from interrupted requests.

---

## [v1.2.2] — 2026-03-01

### Fixed
- **Sad face LED pattern** — Replaced broken custom pattern with official `LEDMATRIX_EMOJI_SAD` from the Arduino gallery. Now displays a proper frown instead of garbled pixels.
- **Heart LED pattern** — Replaced custom pattern with official `LEDMATRIX_HEART_BIG` from the Arduino gallery for a clean heart outline.

### Added
- **Tick on toggle** — When a TOGGLE command is received, the LED matrix briefly shows a ✓ checkmark for 1 second before returning to the heart. Provides immediate visual feedback on the device.
- **Product roadmap** — Added `docs/ROADMAP.md` with planned features organized by version (v1.3–v2.0 and beyond).

---

## [v1.2.1] — 2026-02-27

### Added
- **Remove user** — Admins can now permanently delete non-admin users from the Users screen. A "Remove" button appears on every user card (pending, approved, or denied). Deletes the user and all their audit log history.
- **`DELETE /admin/users/:id`** — New server endpoint to delete a user and their associated audit logs. Prevents self-deletion (admin cannot remove their own account).
- **`deleteUser()` API function** — Mobile client function for the delete endpoint.
- **Git branching workflow docs** — Added a complete feature-branch workflow guide to DEVELOPMENT.md.

---

## [v1.2.0] — 2026-02-27

### Added
- **Device Settings screen** — New screen showing device info (name, ID, status, last seen), server connection details (host, port, endpoint), and network/provisioning info. Accessible via long-press → "Device Settings" or the ⚙️ button on the device detail screen.
- **Editable device name** — Tap the ✎ pencil icon on the Device Settings screen to rename a device inline. Saves to the server via `PATCH /admin/devices/:id`.
- **`PATCH /admin/devices/:id`** — New server endpoint to update device properties (currently supports `name`).
- **`updateDevice()` API function** — Mobile client function for the PATCH endpoint.
- **Device provisioning cleanup** — If a user leaves the Add Device wizard before completing Arduino configuration, the registered device is automatically deleted from the server. The "← Back to form" button also cleans up the orphaned device.
- **Long-press options menu** — Holding a device card now shows an action sheet with "Device Settings" and "Remove Device" options (iOS ActionSheet / Android Alert), replacing the previous direct-delete behavior.
- **Arduino LED matrix heart** — The UNO R4 WiFi's built-in 12×8 LED matrix now shows a heart shape when the device authenticates with the server, and a **sad face** when disconnected or auth fails.
- **Google account switching** — Sign Out now also signs out of Google, so the next sign-in always shows the Google account chooser. Users can switch between Google accounts without clearing app data.

### Changed
- **Toggle button icon** — Replaced the ⚡ emoji with a visual toggle-switch widget (track + thumb) on the device detail screen, giving a more intuitive "switch" look.
- **Device card UI** — Removed the dedicated red ✕ delete button from device cards. Deletion is now accessed via the long-press options menu for a cleaner card layout.
- **Device detail screen** — Added a ⚙️ settings gear button in the device info card header for quick access to device settings.
- **WebSocket server** — Enabled `perMessageDeflate: true` on the server's WebSocketServer to accept RSV1 (compressed) frames from the Arduino client, fixing the "Invalid WebSocket frame: RSV1 must be clear" connection error.
- **Arduino serial timeout** — `while (!Serial)` now times out after 3 seconds instead of blocking forever, so factory reset and normal boot work without the Serial Monitor open.

### Fixed
- **WebSocket RSV1 error** — Arduino's WebSocket client was sending frames with the RSV1 compression bit set, but the server rejected them. Enabled permessage-deflate on the server to accept these frames.
- **WiFi password masking (Android)** — `secureTextEntry` didn't render bullet characters on some Android devices. Replaced with a transparent text + bullet overlay approach that avoids all race conditions with Android's TextInput re-rendering.
- **Google Sign-In always used same account** — Added `GoogleSignin.signOut()` before `signIn()` to force the account chooser on every sign-in attempt.
- **Ghost devices on abandoned provisioning** — Registering a device then leaving the wizard no longer leaves orphaned devices on the server.
- **Arduino factory reset blocked by Serial.begin** — The `while (!Serial)` infinite wait prevented the factory-reset pin check from ever running when Serial Monitor wasn't connected.

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
