/*
 * Gate Controller — Arduino UNO R4 WiFi
 *
 * Two modes:
 *   1. PROVISIONING — No config in EEPROM → starts as WiFi AP
 *      ("GateController").  The mobile app connects and sends WiFi
 *      credentials, server address, and device token via HTTP.
 *      Config is saved to EEPROM and the board reboots.
 *
 *   2. NORMAL — Config found in EEPROM → connects to WiFi, opens
 *      WebSocket to server, authenticates, listens for TOGGLE
 *      commands, sends heartbeats.
 *
 * Factory reset:  Hold RESET_PIN (pin 3) LOW during boot to clear
 *                 EEPROM and re-enter provisioning mode.
 *
 * Required libraries (install via Arduino Library Manager):
 *   - WiFiS3            (built-in for UNO R4 WiFi)
 *   - ArduinoHttpClient (by Arduino — provides WebSocketClient)
 *   - ArduinoJson       (by Benoit Blanchon, v7+)
 */

#include <WiFiS3.h>
#include <ArduinoHttpClient.h>
#include <ArduinoJson.h>
#include "config.h"
#include "provisioning.h"

// ── Factory reset pin ────────────────────────────────────────────────
#define RESET_PIN  3   // Hold LOW during boot to factory-reset

// ── Runtime state ────────────────────────────────────────────────────
bool          provisioning  = false;
WiFiClient    wifiClient;
WebSocketClient* wsClient   = nullptr;

unsigned long lastHeartbeat  = 0;
unsigned long lastReconnect  = 0;
bool          wsConnected    = false;
bool          authenticated  = false;

// ── Forward declarations ─────────────────────────────────────────────
void connectWiFi();
void connectWebSocket();
void sendAuth();
void sendHeartbeat();
void handleMessage(const String& message);
void pulseRelay();
void sendAck(bool ok);

// ─────────────────────────────────────────────────────────────────────
// setup()
// ─────────────────────────────────────────────────────────────────────
void setup() {
  Serial.begin(115200);
  while (!Serial) { ; }

  // Configure hardware pins
  pinMode(RELAY_PIN, OUTPUT);
  digitalWrite(RELAY_PIN, LOW);

  pinMode(RESET_PIN, INPUT_PULLUP);

  Serial.println(F(""));
  Serial.println(F("─── Gate Controller ───"));
  Serial.print(F("Relay pin: "));
  Serial.println(RELAY_PIN);
  Serial.print(F("Pulse duration: "));
  Serial.print(PULSE_MS);
  Serial.println(F(" ms"));

  // Check for factory reset (hold pin 3 LOW during boot)
  if (digitalRead(RESET_PIN) == LOW) {
    Serial.println(F("[boot] Factory reset triggered (pin 3 LOW)"));
    clearConfig();
    delay(1000);
  }

  // Try to load config from EEPROM
  if (loadConfig()) {
    // ── Normal mode ──────────────────────
    Serial.println(F("[boot] Config found — starting normal mode"));
    provisioning = false;

    // Create WebSocket client with stored config
    DeviceConfig& cfg = getConfig();
    wsClient = new WebSocketClient(wifiClient, cfg.serverHost, cfg.serverPort);

    connectWiFi();
    connectWebSocket();
  } else {
    // ── Provisioning mode ────────────────
    Serial.println(F("[boot] No config — starting provisioning mode"));
    provisioning = true;
    startProvisioning();
  }
}

// ─────────────────────────────────────────────────────────────────────
// loop()
// ─────────────────────────────────────────────────────────────────────
void loop() {
  // ── Provisioning mode: just handle HTTP clients ──
  if (provisioning) {
    handleProvisioningClients();
    return;
  }

  // ── Normal mode ──────────────────────────────────
  unsigned long now = millis();

  // Reconnect if disconnected
  if (!wsConnected) {
    if (now - lastReconnect >= RECONNECT_DELAY_MS) {
      lastReconnect = now;

      if (WiFi.status() != WL_CONNECTED) {
        connectWiFi();
      }
      connectWebSocket();
    }
    return;
  }

  // Check for incoming WebSocket messages
  int messageSize = wsClient->parseMessage();
  if (messageSize > 0) {
    String message = wsClient->readString();
    handleMessage(message);
  }

  // Send heartbeat on schedule
  if (authenticated && (now - lastHeartbeat >= HEARTBEAT_INTERVAL_MS)) {
    sendHeartbeat();
    lastHeartbeat = now;
  }

  // Check if connection was lost
  if (!wsClient->connected()) {
    Serial.println(F("[ws] Connection lost"));
    wsConnected   = false;
    authenticated = false;
  }
}

// ─────────────────────────────────────────────────────────────────────
// WiFi connection (uses EEPROM-stored credentials)
// ─────────────────────────────────────────────────────────────────────
void connectWiFi() {
  DeviceConfig& cfg = getConfig();
  Serial.print(F("[wifi] Connecting to "));
  Serial.println(cfg.ssid);

  WiFi.begin(cfg.ssid, cfg.password);

  int attempts = 0;
  while (WiFi.status() != WL_CONNECTED) {
    delay(WIFI_RETRY_DELAY_MS);
    Serial.print(F("."));
    attempts++;

    if (attempts >= WIFI_TIMEOUT_ATTEMPTS) {
      Serial.println(F("\n[wifi] FAILED — restarting..."));
      NVIC_SystemReset();
    }
  }

  Serial.println();
  Serial.print(F("[wifi] Connected — IP: "));
  Serial.println(WiFi.localIP());
}

// ─────────────────────────────────────────────────────────────────────
// WebSocket connection
// ─────────────────────────────────────────────────────────────────────
void connectWebSocket() {
  DeviceConfig& cfg = getConfig();
  Serial.print(F("[ws] Connecting to "));
  Serial.print(cfg.serverHost);
  Serial.print(F(":"));
  Serial.print(cfg.serverPort);
  Serial.println(F("/device/ws"));

  wsClient->begin("/device/ws");

  if (wsClient->connected()) {
    Serial.println(F("[ws] Connected"));
    wsConnected   = true;
    authenticated = false;
    sendAuth();
  } else {
    Serial.println(F("[ws] Connection failed"));
    wsConnected = false;
  }
}

// ─────────────────────────────────────────────────────────────────────
// Send AUTH message (uses EEPROM-stored device token)
// ─────────────────────────────────────────────────────────────────────
void sendAuth() {
  DeviceConfig& cfg = getConfig();

  JsonDocument doc;
  doc["type"]  = "AUTH";
  doc["token"] = cfg.deviceToken;

  String payload;
  serializeJson(doc, payload);

  wsClient->beginMessage(TYPE_TEXT);
  wsClient->print(payload);
  wsClient->endMessage();

  Serial.println(F("[ws] AUTH sent"));
}

// ─────────────────────────────────────────────────────────────────────
// Send HEARTBEAT message
// ─────────────────────────────────────────────────────────────────────
void sendHeartbeat() {
  JsonDocument doc;
  doc["type"] = "HEARTBEAT";

  String payload;
  serializeJson(doc, payload);

  wsClient->beginMessage(TYPE_TEXT);
  wsClient->print(payload);
  wsClient->endMessage();

  Serial.println(F("[ws] HEARTBEAT sent"));
}

// ─────────────────────────────────────────────────────────────────────
// Send ACK response
// ─────────────────────────────────────────────────────────────────────
void sendAck(bool ok) {
  JsonDocument doc;
  doc["type"] = "ACK";
  doc["ok"]   = ok;

  String payload;
  serializeJson(doc, payload);

  wsClient->beginMessage(TYPE_TEXT);
  wsClient->print(payload);
  wsClient->endMessage();

  Serial.print(F("[ws] ACK sent (ok="));
  Serial.print(ok ? "true" : "false");
  Serial.println(F(")"));
}

// ─────────────────────────────────────────────────────────────────────
// Handle incoming WebSocket messages
// ─────────────────────────────────────────────────────────────────────
void handleMessage(const String& message) {
  JsonDocument doc;
  DeserializationError err = deserializeJson(doc, message);

  if (err) {
    Serial.print(F("[ws] JSON parse error: "));
    Serial.println(err.c_str());
    return;
  }

  const char* type = doc["type"];
  if (!type) {
    Serial.println(F("[ws] Message missing 'type'"));
    return;
  }

  // ── AUTHENTICATED — server confirmed our token ──
  if (strcmp(type, "AUTHENTICATED") == 0) {
    authenticated = true;
    lastHeartbeat = millis();  // Reset heartbeat timer
    const char* deviceId = doc["deviceId"];
    Serial.print(F("[ws] Authenticated as "));
    Serial.println(deviceId ? deviceId : "unknown");
    return;
  }

  // ── AUTH_FAILED — bad token ─────────────────────
  if (strcmp(type, "AUTH_FAILED") == 0) {
    Serial.println(F("[ws] Authentication FAILED — check DEVICE_TOKEN"));
    authenticated = false;
    wsConnected   = false;
    return;
  }

  // ── TOGGLE — server wants us to pulse the relay ─
  if (strcmp(type, "TOGGLE") == 0) {
    Serial.println(F("[cmd] TOGGLE received — pulsing relay"));
    pulseRelay();
    sendAck(true);
    return;
  }

  // ── PONG — heartbeat response ───────────────────
  if (strcmp(type, "PONG") == 0) {
    // Nothing to do — server confirmed heartbeat
    return;
  }

  // ── ERROR ───────────────────────────────────────
  if (strcmp(type, "ERROR") == 0) {
    const char* msg = doc["message"];
    Serial.print(F("[ws] Server error: "));
    Serial.println(msg ? msg : "unknown");
    return;
  }

  Serial.print(F("[ws] Unknown message type: "));
  Serial.println(type);
}

// ─────────────────────────────────────────────────────────────────────
// Momentary relay pulse (garage-door-button style)
// ─────────────────────────────────────────────────────────────────────
void pulseRelay() {
  Serial.println(F("[relay] ON"));
  digitalWrite(RELAY_PIN, HIGH);
  delay(PULSE_MS);
  digitalWrite(RELAY_PIN, LOW);
  Serial.println(F("[relay] OFF"));
}
