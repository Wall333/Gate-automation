/*
 * provisioning.h — EEPROM config storage + WiFi AP provisioning server
 *
 * On first boot (or after factory reset), the Arduino has no stored config.
 * It starts as a WiFi Access Point ("GateController") and serves a tiny
 * HTTP API.  The mobile app connects to this AP and POSTs the real WiFi
 * credentials, server address, and device token.  The Arduino saves them
 * to EEPROM and reboots into normal operating mode.
 *
 * EEPROM layout (total ~230 bytes):
 *   [0..3]      Magic bytes  "GATE"
 *   [4..35]     SSID         (32 bytes, null-terminated)
 *   [36..99]    Password     (64 bytes, null-terminated)
 *   [100..163]  Server host  (64 bytes, null-terminated)
 *   [164..165]  Server port  (uint16_t, little-endian)
 *   [166..229]  Device token (64 bytes, null-terminated)
 */

#ifndef PROVISIONING_H
#define PROVISIONING_H

#include <EEPROM.h>
#include <WiFiS3.h>
#include <ArduinoJson.h>
#include "config.h"

// ── EEPROM addresses ─────────────────────────────────────────────────
#define EEPROM_SIZE       230
#define ADDR_MAGIC        0
#define ADDR_SSID         4
#define ADDR_PASSWORD     36
#define ADDR_SERVER_HOST  100
#define ADDR_SERVER_PORT  164
#define ADDR_DEVICE_TOKEN 166

#define MAGIC_BYTES "GATE"
#define MAGIC_LEN   4

// ── Stored configuration ─────────────────────────────────────────────
struct DeviceConfig {
  char     ssid[32];
  char     password[64];
  char     serverHost[64];
  uint16_t serverPort;
  char     deviceToken[64];
  bool     valid;           // true if loaded successfully from EEPROM
};

static DeviceConfig _config;
static WiFiServer   _provServer(AP_PORT);

// ── Forward declarations ─────────────────────────────────────────────
bool     loadConfig();
void     saveConfig(const DeviceConfig& cfg);
void     clearConfig();
void     startProvisioning();
void     handleProvisioningClients();
DeviceConfig& getConfig();

// ─────────────────────────────────────────────────────────────────────
// Load config from EEPROM. Returns true if valid config found.
// ─────────────────────────────────────────────────────────────────────
bool loadConfig() {
  // Check magic bytes
  char magic[MAGIC_LEN + 1];
  for (int i = 0; i < MAGIC_LEN; i++) {
    magic[i] = EEPROM.read(ADDR_MAGIC + i);
  }
  magic[MAGIC_LEN] = '\0';

  if (strcmp(magic, MAGIC_BYTES) != 0) {
    Serial.println(F("[config] No config in EEPROM (magic mismatch)"));
    _config.valid = false;
    return false;
  }

  // Read SSID
  for (int i = 0; i < 32; i++) {
    _config.ssid[i] = EEPROM.read(ADDR_SSID + i);
  }
  _config.ssid[31] = '\0';

  // Read password
  for (int i = 0; i < 64; i++) {
    _config.password[i] = EEPROM.read(ADDR_PASSWORD + i);
  }
  _config.password[63] = '\0';

  // Read server host
  for (int i = 0; i < 64; i++) {
    _config.serverHost[i] = EEPROM.read(ADDR_SERVER_HOST + i);
  }
  _config.serverHost[63] = '\0';

  // Read server port (little-endian)
  uint8_t lo = EEPROM.read(ADDR_SERVER_PORT);
  uint8_t hi = EEPROM.read(ADDR_SERVER_PORT + 1);
  _config.serverPort = (hi << 8) | lo;

  // Read device token
  for (int i = 0; i < 64; i++) {
    _config.deviceToken[i] = EEPROM.read(ADDR_DEVICE_TOKEN + i);
  }
  _config.deviceToken[63] = '\0';

  _config.valid = true;

  Serial.println(F("[config] Loaded from EEPROM:"));
  Serial.print(F("  SSID:   ")); Serial.println(_config.ssid);
  Serial.print(F("  Server: ")); Serial.print(_config.serverHost);
  Serial.print(F(":")); Serial.println(_config.serverPort);
  Serial.println(F("  Token:  ****"));

  return true;
}

// ─────────────────────────────────────────────────────────────────────
// Save config to EEPROM
// ─────────────────────────────────────────────────────────────────────
void saveConfig(const DeviceConfig& cfg) {
  // Write magic
  for (int i = 0; i < MAGIC_LEN; i++) {
    EEPROM.write(ADDR_MAGIC + i, MAGIC_BYTES[i]);
  }

  // Write SSID
  for (int i = 0; i < 32; i++) {
    EEPROM.write(ADDR_SSID + i, cfg.ssid[i]);
  }

  // Write password
  for (int i = 0; i < 64; i++) {
    EEPROM.write(ADDR_PASSWORD + i, cfg.password[i]);
  }

  // Write server host
  for (int i = 0; i < 64; i++) {
    EEPROM.write(ADDR_SERVER_HOST + i, cfg.serverHost[i]);
  }

  // Write server port (little-endian)
  EEPROM.write(ADDR_SERVER_PORT, cfg.serverPort & 0xFF);
  EEPROM.write(ADDR_SERVER_PORT + 1, (cfg.serverPort >> 8) & 0xFF);

  // Write device token
  for (int i = 0; i < 64; i++) {
    EEPROM.write(ADDR_DEVICE_TOKEN + i, cfg.deviceToken[i]);
  }

  Serial.println(F("[config] Saved to EEPROM"));
}

// ─────────────────────────────────────────────────────────────────────
// Clear config (factory reset)
// ─────────────────────────────────────────────────────────────────────
void clearConfig() {
  for (int i = 0; i < EEPROM_SIZE; i++) {
    EEPROM.write(i, 0);
  }
  _config.valid = false;
  Serial.println(F("[config] EEPROM cleared"));
}

// ─────────────────────────────────────────────────────────────────────
// Get reference to current config
// ─────────────────────────────────────────────────────────────────────
DeviceConfig& getConfig() {
  return _config;
}

// ─────────────────────────────────────────────────────────────────────
// Start provisioning mode (AP + HTTP server)
// ─────────────────────────────────────────────────────────────────────
void startProvisioning() {
  Serial.println(F(""));
  Serial.println(F("╔══════════════════════════════════════════╗"));
  Serial.println(F("║       PROVISIONING MODE ACTIVE           ║"));
  Serial.println(F("╠══════════════════════════════════════════╣"));
  Serial.print(  F("║  WiFi AP: ")); Serial.println(AP_SSID);
  Serial.print(  F("║  Password: ")); Serial.println(AP_PASSWORD);
  Serial.println(F("║  Connect with the Gate Controller app    ║"));
  Serial.println(F("║  and go to Settings → Add Device         ║"));
  Serial.println(F("╚══════════════════════════════════════════╝"));
  Serial.println(F(""));

  // Start Access Point
  WiFi.beginAP(AP_SSID, AP_PASSWORD);
  delay(2000);  // Let AP stabilize

  Serial.print(F("[provision] AP IP: "));
  Serial.println(WiFi.localIP());

  // Start HTTP server
  _provServer.begin();
  Serial.println(F("[provision] HTTP server started on port 80"));
  Serial.println(F("[provision] Waiting for configuration..."));
}

// ─────────────────────────────────────────────────────────────────────
// Handle incoming provisioning HTTP requests (call in loop)
//
// Supported endpoints:
//   GET  /status       → { "status": "ready", "ap": "GateController" }
//   POST /configure    → saves config and reboots
//   POST /reset        → clears EEPROM and reboots
// ─────────────────────────────────────────────────────────────────────
void handleProvisioningClients() {
  WiFiClient client = _provServer.available();
  if (!client) return;

  // Wait for data with timeout
  unsigned long start = millis();
  while (!client.available()) {
    if (millis() - start > 5000) {
      client.stop();
      return;
    }
    delay(1);
  }

  // Read the full request
  String request = "";
  String body = "";
  bool headersDone = false;
  int contentLength = 0;

  while (client.available() || !headersDone) {
    if (!client.available()) {
      delay(1);
      if (millis() - start > 10000) break;  // Total timeout
      continue;
    }

    String line = client.readStringUntil('\n');
    line.trim();

    if (request.length() == 0) {
      request = line;  // First line: "GET /status HTTP/1.1"
    }

    // Check for Content-Length header
    if (line.startsWith("Content-Length:") || line.startsWith("content-length:")) {
      contentLength = line.substring(line.indexOf(':') + 1).toInt();
    }

    // Empty line = end of headers
    if (line.length() == 0) {
      headersDone = true;

      // Read body if present
      if (contentLength > 0) {
        unsigned long bodyStart = millis();
        while (body.length() < (unsigned int)contentLength) {
          if (client.available()) {
            body += (char)client.read();
          } else if (millis() - bodyStart > 5000) {
            break;
          } else {
            delay(1);
          }
        }
      }
      break;
    }
  }

  Serial.print(F("[provision] Request: "));
  Serial.println(request);

  // ── CORS headers (needed for app HTTP requests) ──
  auto sendCors = [&client]() {
    client.println(F("Access-Control-Allow-Origin: *"));
    client.println(F("Access-Control-Allow-Methods: GET, POST, OPTIONS"));
    client.println(F("Access-Control-Allow-Headers: Content-Type"));
  };

  // ── OPTIONS (CORS preflight) ──────────────────────
  if (request.startsWith("OPTIONS")) {
    client.println(F("HTTP/1.1 204 No Content"));
    sendCors();
    client.println(F("Content-Length: 0"));
    client.println();
    client.stop();
    return;
  }

  // ── GET /status ───────────────────────────────────
  if (request.startsWith("GET /status")) {
    String json = "{\"status\":\"ready\",\"ap\":\"" + String(AP_SSID) + "\"}";
    client.println(F("HTTP/1.1 200 OK"));
    client.println(F("Content-Type: application/json"));
    sendCors();
    client.print(F("Content-Length: "));
    client.println(json.length());
    client.println();
    client.print(json);
    client.stop();
    return;
  }

  // ── POST /configure ──────────────────────────────
  if (request.startsWith("POST /configure")) {
    Serial.print(F("[provision] Body: "));
    Serial.println(body);

    JsonDocument doc;
    DeserializationError err = deserializeJson(doc, body);

    if (err) {
      String errJson = "{\"error\":\"Invalid JSON: " + String(err.c_str()) + "\"}";
      client.println(F("HTTP/1.1 400 Bad Request"));
      client.println(F("Content-Type: application/json"));
      sendCors();
      client.print(F("Content-Length: "));
      client.println(errJson.length());
      client.println();
      client.print(errJson);
      client.stop();
      return;
    }

    // Validate required fields
    if (!doc["ssid"] || !doc["password"] || !doc["serverHost"] || !doc["deviceToken"]) {
      String missing = "{\"error\":\"Missing required fields: ssid, password, serverHost, deviceToken\"}";
      client.println(F("HTTP/1.1 400 Bad Request"));
      client.println(F("Content-Type: application/json"));
      sendCors();
      client.print(F("Content-Length: "));
      client.println(missing.length());
      client.println();
      client.print(missing);
      client.stop();
      return;
    }

    // Build config
    DeviceConfig newCfg;
    strncpy(newCfg.ssid,        doc["ssid"]        | "", sizeof(newCfg.ssid) - 1);
    newCfg.ssid[sizeof(newCfg.ssid) - 1] = '\0';
    strncpy(newCfg.password,    doc["password"]     | "", sizeof(newCfg.password) - 1);
    newCfg.password[sizeof(newCfg.password) - 1] = '\0';
    strncpy(newCfg.serverHost,  doc["serverHost"]   | "", sizeof(newCfg.serverHost) - 1);
    newCfg.serverHost[sizeof(newCfg.serverHost) - 1] = '\0';
    newCfg.serverPort = doc["serverPort"] | 3000;
    strncpy(newCfg.deviceToken, doc["deviceToken"]  | "", sizeof(newCfg.deviceToken) - 1);
    newCfg.deviceToken[sizeof(newCfg.deviceToken) - 1] = '\0';

    // Save to EEPROM
    saveConfig(newCfg);

    // Send success response
    String ok = "{\"status\":\"configured\",\"message\":\"Rebooting into normal mode...\"}";
    client.println(F("HTTP/1.1 200 OK"));
    client.println(F("Content-Type: application/json"));
    sendCors();
    client.print(F("Content-Length: "));
    client.println(ok.length());
    client.println();
    client.print(ok);
    client.flush();
    client.stop();

    Serial.println(F("[provision] Config saved! Rebooting in 2 seconds..."));
    delay(2000);
    NVIC_SystemReset();  // Reboot into normal mode
  }

  // ── POST /reset ───────────────────────────────────
  if (request.startsWith("POST /reset")) {
    clearConfig();

    String ok = "{\"status\":\"reset\",\"message\":\"Config cleared. Rebooting...\"}";
    client.println(F("HTTP/1.1 200 OK"));
    client.println(F("Content-Type: application/json"));
    sendCors();
    client.print(F("Content-Length: "));
    client.println(ok.length());
    client.println();
    client.print(ok);
    client.flush();
    client.stop();

    Serial.println(F("[provision] Factory reset! Rebooting..."));
    delay(2000);
    NVIC_SystemReset();
  }

  // ── 404 ───────────────────────────────────────────
  String notFound = "{\"error\":\"Not found\"}";
  client.println(F("HTTP/1.1 404 Not Found"));
  client.println(F("Content-Type: application/json"));
  sendCors();
  client.print(F("Content-Length: "));
  client.println(notFound.length());
  client.println();
  client.print(notFound);
  client.stop();
}

#endif // PROVISIONING_H
