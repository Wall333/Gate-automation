# ADR 0001: Technology Stack

**Status:** Accepted  
**Date:** 2026-02-26

## Context

We need to choose technologies for three components of the gate controller system:
1. A backend server that handles authentication, authorization, and device communication.
2. A mobile application for end users to control the gate.
3. An embedded device that physically actuates the gate relay.

## Decision

| Component | Technology | Version / Notes |
|-----------|-----------|-----------------|
| Server | **Node.js** (Express) | LTS ≥ 18 |
| Database | **SQLite** (via Prisma ORM) | MVP; migrate to PostgreSQL if needed |
| Mobile | **React Native** | Cross-platform (Android + iOS) |
| Device | **Arduino UNO R4 WiFi** | Built-in WiFi (ESP32-S3 module) |
| Device comms | **WebSocket** (outbound from device) | Fallback: HTTP polling |

## Rationale

- **Node.js / Express:** Lightweight, widely known, large ecosystem. WebSocket support is straightforward with the `ws` library. Good fit for a small API server.
- **SQLite / Prisma:** Zero-infrastructure database for MVP. Prisma provides type-safe queries and easy migration path to PostgreSQL or MySQL.
- **React Native:** Single codebase for Android and iOS. The team has JavaScript/TypeScript experience.
- **Arduino UNO R4 WiFi:** Affordable, widely available, built-in WiFi via the on-board ESP32-S3 module. Sufficient for receiving simple commands and pulsing a relay.
- **WebSocket (outbound):** The Arduino connects outward to the server, avoiding NAT/firewall issues. Provides near-instant command delivery without polling overhead.

## Consequences

- Team must maintain JavaScript/TypeScript skills across server and mobile.
- SQLite limits concurrent writes; acceptable for MVP with a single device and low traffic.
- Arduino UNO R4 WiFi has limited RAM (~256 KB); WebSocket payloads must stay small.
- If React Native proves too heavy for the simple UI, Expo or a web-based PWA are viable alternatives.
