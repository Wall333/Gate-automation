# Gate Controller — Feature Roadmap

> **Current version:** v1.2.1  
> **Last updated:** February 27, 2026

This document outlines the planned and potential features for the Gate Controller project. Features are organized by release, with a summary of what each one brings to the user experience. If you're looking for technical implementation details, those live in the spec files under `docs/specs/`.

---

## What We Have Today (v1.0 – v1.2.1)

The Gate Controller is a smart gate system with three components: an **Android app**, a **cloud server**, and an **Arduino board** wired to the gate's relay. Here's what's already built:

- Sign in with Google, admin approval flow
- Open/close the gate from your phone, anywhere in the world
- Add and configure gate devices over WiFi (no manual setup)
- See which devices are online and when they were last active
- Rename devices, view connection details
- Full audit log of every gate open/close (who, when, success/fail)
- Manage users: approve, deny, or remove
- LED feedback on the Arduino (heart = connected, sad face = disconnected)

---

## v1.3 — Stay in the Loop

*Know what's happening at your gate without opening the app.*

### Push Notifications
Get a notification on your phone whenever someone opens or closes the gate. You'll see who did it and which gate, right from your lock screen. No more checking the audit log to see if someone came through.

### Activity Feed
See the last few gate events right on the main screen when you open the app — a quick glance to see who's been coming and going. Currently this info is tucked away in the admin-only audit log.

---

## v1.4 — Let People In

*Share access without sharing your account.*

### Guest Access
Need to let in a delivery driver, a friend, or a contractor? Generate a temporary access link that lets someone open the gate from their browser — no app install, no Google account needed. You control how many times it can be used and when it expires. Revoke it any time.

### Dark Mode
The app will follow your phone's system theme. If you use dark mode on your phone, the Gate Controller app will match.

---

## v1.5 — Know Your Gate

*See the actual state of your gate and let it take care of itself.*

### Gate Position Sensing
Right now the app shows whether the Arduino is *online*, but not whether the gate is actually *open or closed*. By adding a small magnetic sensor to the gate, the app will show the real physical state — so you'll always know if you left it open.

### Auto-Close Timer
Forgot to close the gate? With auto-close, the gate will automatically shut itself after a time you set (30 seconds, 1 minute, etc.). Configurable per gate from the app. Requires the gate position sensor above.

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

### Over-the-Air Arduino Updates
Update the Arduino's code over WiFi instead of plugging in a USB cable. Useful once the Arduino is installed in a hard-to-reach spot.

---

## Release Timeline

| Version | Theme | Status |
|---------|-------|--------|
| v1.0 | Core system — sign in, toggle, audit | Done |
| v1.1 | Device provisioning, per-device tokens | Done |
| v1.2 | UI polish, device settings, LED feedback | Done |
| v1.2.1 | Admin remove user | Done |
| v1.3 | Notifications & activity feed | Planned |
| v1.4 | Guest access & dark mode | Planned |
| v1.5 | Gate state sensing & auto-close | Planned |
| v2.0 | Roles, schedules, multi-gate | Planned |
| Future | Camera, voice, widget, geofence, OTA | Ideas |

---

Have a feature idea? Open an issue on [GitHub](https://github.com/Wall333/Gate-automation/issues).
