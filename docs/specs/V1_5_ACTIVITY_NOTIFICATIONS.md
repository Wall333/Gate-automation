# v1.5 — Stay in the Loop: Activity Feed & Notifications

> **Version:** v1.5.0  
> **Date:** March 3, 2026  
> **Status:** In development

---

## 1. Overview

v1.5 adds two features that keep users informed about what's happening at their gate:

1. **Activity Feed** — A timeline of gate open/close events visible to all approved users. Events are captured from the reed switch state change (not just app toggles), so manual remote usage is also recorded.

2. **Push Notifications** — Users choose what they want to be notified about via a preferences panel:
   - Gate opened (who, when)
   - Gate closed (who, when)
   - Gate has been open for too long (configurable threshold)

### Key design constraint

The gate can be operated via the CAME remote, wall button, or the app. Only app-triggered events know which user acted. Remote/manual events are logged as system events with no user attribution.

---

## 2. Data Model

### GateEvent

Records every gate state transition detected by the reed switch.

| Column    | Type     | Notes |
|-----------|----------|-------|
| id        | UUID PK  | Auto-generated |
| deviceId  | UUID FK  | Which device reported the event |
| event     | String   | `"OPENED"` \| `"CLOSED"` |
| triggeredBy | String? | `null` = manual/remote, otherwise the user's name (from the most recent TOGGLE audit log within a short window) |
| triggeredByUserId | String? | FK to User, `null` for manual/remote events |
| timestamp | DateTime | When the state change occurred |

**Attribution logic:** When a `GATE_STATE` message arrives, the server checks if a TOGGLE audit log was created for this device within the last 30 seconds. If so, the event is attributed to that user. Otherwise, it's recorded as a manual/remote event (`triggeredBy: null`).

### NotificationPreference

Per-user notification settings.

| Column           | Type     | Notes |
|------------------|----------|-------|
| id               | UUID PK  | Auto-generated |
| userId           | UUID FK  | Unique — one row per user |
| notifyOnOpen     | Boolean  | Notify when gate opens (default: `false`) |
| notifyOnClose    | Boolean  | Notify when gate closes (default: `false`) |
| openTooLongMin   | Int?     | Notify if gate open longer than N minutes. `null` = disabled |
| fcmToken         | String?  | Expo push token (column name kept for compat) |
| updatedAt        | DateTime | |

---

## 3. API Endpoints

### 3.1 `GET /gate/events`

Fetch recent gate events for the activity feed. Requires valid JWT (any approved user).

**Query parameters:**
- `limit` (optional, default 50, max 200)
- `deviceId` (optional — filter by device)
- `before` (optional — cursor-based pagination, ISO timestamp)

**Response:**
```json
[
  {
    "id": "...",
    "deviceId": "...",
    "deviceName": "Front Gate",
    "event": "OPENED",
    "triggeredBy": "John Smith",
    "timestamp": "2026-03-03T14:30:00Z"
  },
  {
    "id": "...",
    "deviceId": "...",
    "deviceName": "Front Gate",
    "event": "CLOSED",
    "triggeredBy": null,
    "timestamp": "2026-03-03T14:25:00Z"
  }
]
```

### 3.2 `GET /user/notification-preferences`

Fetch the current user's notification preferences. Requires valid JWT. If no preferences exist yet, returns defaults.

**Response:**
```json
{
  "notifyOnOpen": false,
  "notifyOnClose": false,
  "openTooLongMin": null
}
```

### 3.3 `PUT /user/notification-preferences`

Update the current user's notification preferences. Requires valid JWT.

**Request:**
```json
{
  "notifyOnOpen": true,
  "notifyOnClose": false,
  "openTooLongMin": 5
}
```

**Response:**
```json
{
  "notifyOnOpen": true,
  "notifyOnClose": false,
  "openTooLongMin": 5,
  "updatedAt": "2026-03-03T14:30:00Z"
}
```

### 3.4 `POST /user/push-token`

Register or update the user's Expo push token. Called by the mobile app on startup and when the token refreshes. Requires valid JWT.

**Request:**
```json
{
  "pushToken": "<expo-push-token>"
}
```

**Response:**
```json
{ "ok": true }
```

---

## 4. Push Notification Infrastructure

### Provider: Expo Push API

- **Why Expo Push:** Free, zero config, works with `expo-notifications` natively, supports Android and iOS via a single API. No Firebase project or service account needed.
- **Server implementation:** Simple HTTP POST to `https://exp.host/--/api/v2/push/send`. No additional npm dependencies required (uses native `fetch`).

### Flow

```
Reed switch changes → Arduino sends GATE_STATE → Server receives
    │
    ├─ Create GateEvent record (with user attribution if applicable)
    │
    ├─ Broadcast GATE_STATE to app clients via WebSocket (existing)
    │
    └─ Check NotificationPreferences for all users with push token set
         │
         ├─ notifyOnOpen && event == OPENED  → send push
         ├─ notifyOnClose && event == CLOSED → send push
         └─ openTooLongMin && event == OPENED → start timer
              │
              └─ After N minutes, if gate still open → send push
```

### Notification payloads

**Gate opened (by user):**
```json
{
  "title": "Gate Opened",
  "body": "Front Gate was opened by John Smith",
  "data": { "type": "GATE_OPENED", "deviceId": "..." }
}
```

**Gate opened (manual/remote):**
```json
{
  "title": "Gate Opened",
  "body": "Front Gate was opened",
  "data": { "type": "GATE_OPENED", "deviceId": "..." }
}
```

**Gate closed:**
```json
{
  "title": "Gate Closed",
  "body": "Front Gate was closed",
  "data": { "type": "GATE_CLOSED", "deviceId": "..." }
}
```

**Gate open too long:**
```json
{
  "title": "Gate Still Open",
  "body": "Front Gate has been open for 5 minutes",
  "data": { "type": "GATE_OPEN_TOO_LONG", "deviceId": "..." }
}
```

### Open-too-long timer

- Server maintains an in-memory `Map<deviceId, timeoutId>`.
- When gate **opens**: for each user with `openTooLongMin` set, schedule a `setTimeout` at `openTooLongMin * 60 * 1000` ms.
- When gate **closes**: cancel all pending timers for that device.
- On server restart: check all devices where `isOpen === true`, calculate elapsed time, start timers for remaining duration (or fire immediately if already overdue).
- Each user can have a different threshold, so timers are per-user-per-device.

---

## 5. Mobile App Changes

### New bottom tab: Activity

Add an "Activity" tab between "Devices" and "Users" in the bottom tab navigator. Visible to **all approved users** (not admin-only).

```
Tabs:  [ Devices 📡 ]  [ Activity 📋 ]  [ Users 👥 (admin) ]
```

### Activity Feed Screen

- Displays a scrollable list of gate events, newest first.
- Each event shows:
  - **Icon/color:** Green circle for OPENED, red circle for CLOSED
  - **Title:** "Gate Opened" / "Gate Closed"
  - **Subtitle:** "by John Smith" or "via remote/button" (if `triggeredBy` is null)
  - **Device name** (if multiple devices in future)
  - **Timestamp:** Relative ("2 min ago") for recent, absolute ("Mar 3, 2:30 PM") for older
- Pull-to-refresh to reload
- Load more on scroll (cursor-based pagination via `before` param)
- Real-time updates: new events pushed via existing WebSocket `GATE_STATE` messages are prepended to the list without manual refresh

### Notification Preferences Screen

Accessible from a bell icon (🔔) in the Activity screen header, or from a "Notifications" option in the user menu.

- **Notify when gate opens** — toggle switch (default: off)
- **Notify when gate closes** — toggle switch (default: off)
- **Alert if open too long** — toggle switch + duration picker
  - When enabled, shows a picker: 1 min, 2 min, 5 min, 10 min, 15 min, 30 min
  - Default: 5 min when first enabled

Changes save automatically on toggle/selection (no save button needed).

### Push notification registration

- Use `expo-notifications` to request permission on first launch after sign-in.
- Get Expo push token → send to server via `POST /user/push-token`.
- Listen for token refreshes → re-send to server.

---

## 6. Server Implementation Details

### Event attribution to user

When the server receives a `GATE_STATE` message from a device:

1. Determine the event type: `OPENED` (isOpen=true) or `CLOSED` (isOpen=false).
2. Query the latest AuditLog for this device where `action = 'TOGGLE'` and `result = 'ACK'` and `timestamp > now() - 30 seconds`.
3. If found → attribute the event to that user (`triggeredBy = user.name`, `triggeredByUserId = user.id`).
4. If not found → `triggeredBy = null` (manual/remote operation).
5. Create the `GateEvent` record.
6. Evaluate notification preferences and send pushes.

### Why 30 seconds?

The window accounts for:
- Network latency (server → Arduino → relay pulse → gate starts moving → reed switch changes → Arduino → server)
- Relay pulse duration (1 second)
- Gate mechanical start delay

30 seconds is generous enough to catch legitimate app-triggered events without falsely attributing manual remote usage.

### Notification sending

- Expo Push API sends to individual push tokens.
- If a token is invalid/expired (Expo returns `DeviceNotRegistered`), clear it from the database.
- Don't send a push notification to the user who triggered the toggle (they already know). Check `triggeredByUserId !== user.id` before sending.

---

## 7. Environment Variables (new)

_No new environment variables required._ Push notifications use the Expo Push API which requires no server-side configuration.

---

## 8. Test Plan

| # | Scenario | Method | Expected Result |
|---|----------|--------|-----------------|
| 1 | Gate opened via app → event logged with user | Toggle via app, check `GET /gate/events` | Event has `triggeredBy: "User Name"` |
| 2 | Gate opened via remote → event logged without user | Open gate with CAME remote, check events | Event has `triggeredBy: null` |
| 3 | Gate closed → event logged | Close gate, check events | `CLOSED` event present |
| 4 | Activity feed shows events | Open Activity tab | List of events displayed, newest first |
| 5 | Real-time feed update | Open Activity tab, toggle gate from another device | New event appears without refresh |
| 6 | Pagination works | Generate >50 events, scroll down | Older events load on scroll |
| 7 | User enables open notification | Toggle "Notify when gate opens" → open gate | Push notification received |
| 8 | User enables close notification | Toggle "Notify when gate closes" → close gate | Push notification received |
| 9 | Open-too-long alert fires | Set to 1 min, open gate, wait 1 min | "Gate Still Open" notification received |
| 10 | Open-too-long cancels on close | Set to 1 min, open gate, close within 30s | No notification |
| 11 | No self-notification | User A toggles, User A has notifyOnOpen=true | User A does NOT get push (they triggered it) |
| 12 | Multiple users get notified | User A toggles, User B+C have notifyOnOpen=true | B and C get push, A doesn't |
| 13 | Remote open → everyone notified | Open via CAME remote, users have notifyOnOpen=true | All subscribed users get push |
| 14 | Invalid push token cleaned up | Send notification with expired token | Token removed from DB, no crash |
| 15 | Preferences default to off | New user checks notification prefs | All toggles off, openTooLongMin null |
| 16 | Server restart recovers open-too-long timers | Gate already open, restart server | Timer restarts for remaining duration |

---

## 9. Implementation Phases

### Phase A — Data Model & Activity Feed
1. Add `GateEvent` and `NotificationPreference` models to Prisma schema.
2. Run migration.
3. Update `deviceManager.js` GATE_STATE handler to create GateEvent records (with user attribution).
4. Create `GET /gate/events` endpoint.
5. Build Activity tab + feed screen in mobile app.

### Phase B — Notification Preferences
6. Create `GET /user/notification-preferences` and `PUT /user/notification-preferences` endpoints.
7. Create `POST /user/push-token` endpoint.
8. Build Notification Preferences screen in mobile app.

### Phase C — Push Notifications
9. Install `expo-notifications` in mobile app, request permissions, register Expo push token.
10. Implement server-side push sending via Expo Push API (`https://exp.host/--/api/v2/push/send`).
11. Server: send push notifications on gate events based on user preferences.
12. Server: implement open-too-long timer logic.
13. Server: recover timers on restart.
