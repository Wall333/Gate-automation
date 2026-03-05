# ADR 0001: Technology Stack

**Status:** Accepted  
**Date:** 2026-02-26  
**Updated:** 2026-03-05 (v1.5.4 — HTTPS via Caddy + DuckDNS)

## Context

We need to choose technologies for three components of the gate controller system:
1. A backend server that handles authentication, authorization, and device communication.
2. A mobile application for end users to control the gate.
3. An embedded device that physically actuates the gate relay.

## Decision

| Component | Technology | Version / Notes |
|-----------|-----------|-----------------|
| Server runtime | **Node.js** (Express 5) | LTS ≥ 18 |
| Database | **SQLite** (via Prisma ORM) | MVP; migrate to PostgreSQL if needed |
| Mobile framework | **Expo** (React Native) | SDK 54, React Native 0.81 |
| Push notifications | **Expo Push API** + **Firebase Cloud Messaging** | Expo Push = server-side API; FCM = Android transport |
| Device | **Arduino UNO R4 WiFi** | Built-in WiFi (ESP32-S3 module) |
| Device comms | **WebSocket** (outbound from device) | Dual-path: `/device/ws` + `/app/ws` |

### Server Dependencies

| Package | Role |
|---------|------|
| `express` 5 | HTTP framework |
| `ws` | WebSocket server (noServer mode, dual path) |
| `@prisma/client` + `prisma` | ORM + migrations (SQLite) |
| `google-auth-library` | Verify Google ID tokens |
| `jsonwebtoken` | JWT signing and verification |
| `bcryptjs` | Hash device tokens |
| `multer` | Firmware file uploads |
| `zod` 4 | Request validation |
| `express-rate-limit` | Rate limiting |
| `dotenv` | Environment variable loading |
| `uuid` | Unique ID generation |

### Mobile Dependencies

| Package | Role |
|---------|------|
| `expo` SDK 54 | Build toolchain, managed workflow |
| `react-native` 0.81 | UI framework |
| `@react-navigation/native` + stacks + tabs | Navigation |
| `@react-native-google-signin/google-signin` | Native Google Sign-In |
| `expo-notifications` | Push notification permissions, tokens, foreground handling |
| `expo-constants` + `expo-application` | Runtime version/build info |
| Firebase Cloud Messaging (via `google-services.json`) | Android push notification transport |
| `expo-secure-store` | Encrypted credential storage |
| `expo-document-picker` | Firmware file selection for OTA |
| `react-native-wifi-reborn` | WiFi SSID detection during device provisioning |

## Rationale

- **Node.js / Express:** Lightweight, widely known, large ecosystem. WebSocket support is straightforward with the `ws` library. Good fit for a small API server.
- **SQLite / Prisma:** Zero-infrastructure database for MVP. Prisma provides type-safe queries and easy migration path to PostgreSQL or MySQL.
- **Expo (React Native):** Single codebase for Android and iOS. Expo's managed workflow simplifies builds, push notifications, and native module management. The `expo-notifications` library works with Expo Push API for zero-config push delivery.
- **Expo Push API + Firebase Cloud Messaging:** The server sends a simple HTTP POST to Expo's push service, which routes to FCM (Android) or APNs (iOS) transparently. On Android, a Firebase project is required to provide the FCM transport layer (`google-services.json` in the Android build). No Firebase Admin SDK or service account is needed on the server. Free for both platforms.
- **Arduino UNO R4 WiFi:** Affordable, widely available, built-in WiFi via the on-board ESP32-S3 module. Sufficient for receiving simple commands and pulsing a relay.
- **WebSocket (outbound):** The Arduino connects outward to the server, avoiding NAT/firewall issues. Provides near-instant command delivery without polling overhead. Dual WebSocket paths separate device traffic from app client traffic. Uses `WiFiSSLClient` for TLS (WSS) through the Caddy reverse proxy.

## Consequences

- Team must maintain JavaScript skills across server and mobile.
- SQLite limits concurrent writes; acceptable for MVP with a single device and low traffic.
- Arduino UNO R4 WiFi has limited RAM (~256 KB); WebSocket payloads must stay small.
- Expo Push API depends on Expo's servers for push delivery — acceptable trade-off for simple configuration.
- Android builds require a `google-services.json` from a Firebase project (excluded from git via `.gitignore`).
- All traffic (app → server, Arduino → server) is encrypted via TLS. Caddy reverse proxy terminates TLS on `gatecontroller.duckdns.org` with auto-renewing Let's Encrypt certificates.
