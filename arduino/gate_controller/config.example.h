// ─── Gate Controller Configuration ───────────────────────────────────
// Hardware and timing constants only.
// WiFi, server, and device token are configured at runtime
// via the mobile app (provisioning mode).

#ifndef CONFIG_H
#define CONFIG_H

// ── Hardware ─────────────────────────────────────────────────────────
#define RELAY_PIN     2                 // Digital pin connected to relay module
#define PULSE_MS      1000              // Momentary pulse duration (ms)

// ── Timing ───────────────────────────────────────────────────────────
#define HEARTBEAT_INTERVAL_MS  30000    // Send heartbeat every 30 s
#define RECONNECT_DELAY_MS     5000     // Wait before reconnecting after disconnect
#define WIFI_RETRY_DELAY_MS    1000     // Delay between WiFi connection attempts
#define WIFI_TIMEOUT_ATTEMPTS  30       // Max WiFi connect attempts before reset

// ── Provisioning AP ──────────────────────────────────────────────────
#define AP_SSID       "GateController"  // AP name shown when device is unconfigured
#define AP_PASSWORD   "gatesetup"       // AP password (min 8 chars for WPA2)
#define AP_PORT       80                // HTTP server port during provisioning

#endif // CONFIG_H
