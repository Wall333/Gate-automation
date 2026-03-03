# Changelog

All notable changes to the Gate Controller project are documented here.

---

## [v1.5.1] — 2026-03-03

### Fixed
- **Activity Feed crash** — Fixed named import → default import for `useGateStateSocket` in `ActivityFeedScreen.js`.
- **Node.js 24 build failure** — Removed explicit `expo-constants` plugin entry from `app.json` (auto-links without it).

---

## [v1.5.0] — 2026-03-03

### Added
- **Activity feed** — New "Activity" tab visible to all approved users. Shows a timeline of every gate open/close event, including events triggered by the CAME remote or wall button (not just the app). Events triggered via the app show which user did it; manual/remote events are labelled "via remote / button".
- **Gate event logging** — New `GateEvent` model records every state transition from the reed switch. Events are attributed to the app user who toggled within the last 30 seconds, or logged as manual/remote if no recent toggle is found.
- **Notification preferences** — Each user can choose to be notified when the gate opens, closes, or has been open for too long. Accessible via the 🔔 icon on the Activity screen.
- **Push notifications (Expo Push)** — Push notifications via Expo Push API (no Firebase project needed). Users receive push alerts based on their preferences. The user who triggered the toggle does not receive a self-notification.
- **Open-too-long alerts** — Users can set a threshold (1–30 min). If the gate stays open past that time, a "Gate Still Open" push notification is sent. Timers survive server restarts.
- **Real-time activity feed** — New `GATE_EVENT` WebSocket message broadcasts events to all connected app clients. The Activity screen updates instantly without manual refresh.
- **Notification preference API** — `GET /user/notification-preferences`, `PUT /user/notification-preferences`, `POST /user/push-token`.
- **Gate events API** — `GET /gate/events` with cursor-based pagination (`limit`, `deviceId`, `before` params).
- **`expo-notifications`** — Push notification permissions, token registration, foreground alert handling, Android notification channel.
- **Expo Push API** — Server sends push notifications via Expo's push service (`https://exp.host/--/api/v2/push/send`). No Firebase project or service account needed. Invalid tokens auto-cleaned.
- **About screen** — New "About" tab showing app version, build number, signed-in user, and project links. Version is read from `app.json` at build time via `expo-constants`.

### Changed
- **`useGateStateSocket` hook** — Now accepts a third callback `onGateEvent` for real-time activity feed updates.
- **`deviceManager.js`** — GATE_STATE handler now creates GateEvent records, sends push notifications, and manages open-too-long timers. Exports `recoverOpenTooLongTimers()`.
- **`App.js`** — Added Activity tab (between Devices and Users) with ActivityStack navigator (feed → notification prefs). Added About tab (always visible). Push notification registration runs on authentication.
- **Bottom tab bar** — Now shows four tabs: Devices, Activity, About (all users), Users (admin only).
- **App version** — `app.json` version updated to 1.5.0 with `android.versionCode` 10500. `build.gradle` now reads version dynamically from `app.json` (single source of truth).
- **Server `package.json`** — Version bumped to 1.5.0.

---

## [v1.4.0] — 2026-03-03

### Added
- **OTA firmware updates** — Arduino can now be updated over WiFi without USB. The admin uploads a compiled `.ota` firmware file through the app, and pushes it to the device. The device downloads, verifies, and reboots with the new firmware. EEPROM config (WiFi, server, token) is preserved across updates.
- **`OTA_UPDATE` WebSocket command** — Server sends `{"type":"OTA_UPDATE","url":"..."}` to the device. Arduino uses the `OTAUpdate` library to download and flash via the ESP32-S3 co-processor.
- **`OTA_STATUS` WebSocket messages** — Arduino reports progress (`downloading`, `verifying`, `applying`, `error`) back to the server, which broadcasts to all connected app clients for real-time feedback.
- **Firmware management API** — `POST /admin/firmware` (upload), `GET /admin/firmware` (list), `DELETE /admin/firmware/:id` (remove), `GET /firmware/download/:name` (serve to Arduino), `POST /admin/devices/:id/ota` (trigger update).
- **Firmware model** — New `Firmware` table tracks uploaded files (filename, version, size, upload date).
- **Firmware Update UI** — Device Settings screen now has a "Firmware Update" section (admin only). Upload `.bin` / `.ota` files, view uploaded firmware, and push updates to online devices.
- **`bin2ota.py` conversion tool** — Python script (`tools/bin2ota.py`) converts `.bin` files from Arduino IDE's "Export Compiled Binary" to the `.ota` format required by the R4 WiFi's OTA mechanism. Uses LZSS compression with Arduino-compatible parameters.

### Changed
- **`useGateStateSocket` hook** — Now accepts an optional `onOTAStatus` callback for real-time OTA progress reporting on the Device Settings screen.
- **`deviceManager.js`** — Handles `OTA_STATUS` messages from devices and exports `sendOTAUpdate()`.

---

## [v1.3.0] — 2026-03-02

### Added
- **Gate state detection** — Reed switch on Arduino pin D4 (INPUT_PULLUP) detects whether the gate is open or closed. The switch is debounced (100 ms) and reports state changes over WebSocket.
- **GATE_STATE WebSocket message** — Arduino sends `{"type":"GATE_STATE","isOpen":true/false}` to the server whenever the reed switch state changes. Server persists the state and broadcasts to all connected app clients.
- **App WebSocket (`/app/ws`)** — New real-time WebSocket endpoint for mobile/web clients. Receives gate state broadcasts without polling.
- **Gate state UI** — Device cards on the Devices screen and the Device Detail screen now show "Gate Open" (orange) or "Gate Closed" (green) with lock icons, updated in real time.
- **`isOpen` field on Device model** — New boolean column in the database to persist gate state across restarts.

### Hardware
- **Reed switch wiring** — COM → D4, NO → GND. When the magnet (on the gate) is near, D4 reads LOW (closed). When the magnet moves away, D4 reads HIGH (open).

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
