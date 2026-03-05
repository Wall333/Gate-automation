# Gate Controller — Feature Roadmap

> **Current version:** v1.5.6  
> **Last updated:** March 5, 2026

This document outlines the planned and potential features for the Gate Controller project. Features are organized by release, with a summary of what each one brings to the user experience. If you're looking for technical implementation details, those live in the spec files under `docs/specs/`.

---

## What We Have Today (v1.0 – v1.5.0)

The Gate Controller is a smart gate system with three components: an **Android app**, a **cloud server**, and an **Arduino board** wired to the gate's relay. Here's what's already built:

- Sign in with Google, admin approval flow
- Open/close the gate from your phone, anywhere in the world
- Add and configure gate devices over WiFi (no manual setup)
- See which devices are online and when they were last active
- **Gate state detection** — a magnetic reed switch on the gate reports whether it's open or closed, shown in the app in real time
- **Real-time app updates** — gate state changes pushed to all connected app clients via WebSocket (no polling)
- **Over-the-air firmware updates** — upload new firmware through the app and push it to the Arduino over WiFi (no USB needed)
- **Activity feed** — timeline of every gate open/close event (app-triggered with user name, or manual/remote). Visible to all approved users
- **Push notifications** — choose to be notified when the gate opens, closes, or has been open too long. Per-user preferences. Delivered via Expo Push API with Firebase Cloud Messaging as the Android transport
- Rename devices, view connection details
- Full audit log of every gate open/close (who, when, success/fail)
- Manage users: approve, deny, or remove
- LED feedback on the Arduino (heart = connected, sad face = disconnected, tick = toggle acknowledged)

---

## ~~v1.5 — Stay in the Loop~~ ✅ Done

*Know what's happening at your gate without opening the app.*

Activity feed (all users) showing every gate open/close event with user attribution for app toggles and "via remote / button" for manual use. Auto-refreshes every 30 seconds plus real-time WebSocket updates. Push notifications via Expo Push API (with Firebase Cloud Messaging as Android transport) with per-user preferences: notify on open, notify on close, and alert if gate open too long (configurable 1–30 min). See [V1_5_ACTIVITY_NOTIFICATIONS.md](specs/V1_5_ACTIVITY_NOTIFICATIONS.md) for full spec.

---

## v1.6 — Let People In

*Share access without sharing your account.*

### Guest Access
Need to let in a delivery driver, a friend, or a contractor? Generate a temporary access link that lets someone open the gate from their browser — no app install, no Google account needed. You control how many times it can be used and when it expires. Revoke it any time.

### Dark Mode
The app will follow your phone's system theme. If you use dark mode on your phone, the Gate Controller app will match.

---

## v1.7 — Automatic Gate

*Let the gate take care of itself.*

### Auto-Close Timer
Forgot to close the gate? With auto-close, the gate will automatically shut itself after a time you set (30 seconds, 1 minute, etc.). Configurable per gate from the app. Uses the reed switch gate state detection to know when to trigger.

---

## v2.0 — Full Control

*Fine-grained control over who can do what, and when.*

### User Roles & Permissions
Go beyond just "admin" and "user." Assign roles like:
- **Family** — full access, any time
- **Guest** — limited hours or number of uses
- **View-only** — can see the gate status but can't open it

Permissions are per-gate, so you can give someone access to the front gate but not the garage.

### Scheduled Access
Set time windows for when users can operate the gate. For example: the housekeeper can open the gate Monday through Friday, 9am to 5pm. Outside those hours, their toggle button is disabled.

### Multiple Gates
Control more than one gate from a single Arduino. Front gate, back gate, garage door — each gets its own toggle button in the app, all running through one board.

---

## Future Ideas

*These are on the radar but not yet planned for a specific release.*

### Camera at the Gate
Mount a small camera (around $5 for an ESP32-CAM) at the gate and see a live snapshot in the app when someone requests access. Know who's at the gate before you open it.

### Voice Control
"Hey Google, open the front gate." Integration with Google Home and/or Alexa for hands-free gate control.

### Home Screen Widget
A one-tap button on your Android home screen to toggle the gate without opening the app. Quick and convenient for daily use.

### Geofencing
The gate automatically opens when your phone gets close to home. Uses your phone's GPS to detect when you're approaching — no button press needed. Opt-in, with a configurable distance.

### ~~Over-the-Air Arduino Updates~~ ✅ Done (v1.4.0)
~~Update the Arduino's code over WiFi instead of plugging in a USB cable.~~ Implemented — upload firmware in the app and push to the Arduino from Device Settings.

---

## Release Timeline

| Version | Theme | Status |
|---------|-------|--------|
| v1.0 | Core system — sign in, toggle, audit | Done |
| v1.1 | Device provisioning, per-device tokens | Done |
| v1.2 | UI polish, device settings, LED feedback | Done |
| v1.2.1 | Admin remove user | Done |
| v1.3 | Gate state sensing (reed switch) | Done |
| v1.4 | Over-the-air firmware updates | Done |
| v1.5 | Notifications & activity feed | Done |
| v1.5.4 | HTTPS everywhere (Caddy, WSS, DuckDNS) | Done |
| v1.5.5 | Firmware version tracking & smart OTA | Done |
| v1.5.6 | Activity feed date strip redesign | Done |
| v1.6 | Guest access & dark mode | Planned |
| v1.7 | Auto-close timer | Planned |
| v2.0 | Roles, schedules, multi-gate | Planned |
| Future | Camera, voice, widget, geofence | Ideas |

---

Have a feature idea? Open an issue on [GitHub](https://github.com/Wall333/Gate-automation/issues).
