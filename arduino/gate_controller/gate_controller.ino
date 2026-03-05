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
#include <OTAUpdate.h>
#include "Arduino_LED_Matrix.h"
#include "config.h"
#include "provisioning.h"

// ── Factory reset pin ────────────────────────────────────────────────
#define RESET_PIN  3   // Hold LOW during boot to factory-reset

// ── LED matrix ───────────────────────────────────────────────────────
ArduinoLEDMatrix matrix;

// Heart shape for 12×8 LED matrix (official LEDMATRIX_HEART_BIG)
//   Row 0: ..XX...XX...
//   Row 1: .X..X.X..X..
//   Row 2: .X...X...X..
//   Row 3: .X.......X..
//   Row 4: ..X.....X...
//   Row 5: ...X...X....
//   Row 6: ....X.X.....
//   Row 7: .....X......
const uint32_t heartFrame[] = {
  0x3184a444,
  0x44042081,
  0x100a0040
};

// Sad face for when disconnected (official LEDMATRIX_EMOJI_SAD)
//   Row 0: ............
//   Row 1: ...XX..XX...
//   Row 2: ...XX..XX...
//   Row 3: ............
//   Row 4: ............
//   Row 5: ...XXXXXX...
//   Row 6: ...X....X...
//   Row 7: ............
const uint32_t sadFrame[] = {
  0x00019819,
  0x80000001,
  0xf8108000
};

// Tick / checkmark shown briefly after toggle (last frame of LEDMATRIX_ANIMATION_CHECK)
//   Row 0: ............
//   Row 1: .........X..
//   Row 2: ........X...
//   Row 3: .......X....
//   Row 4: ..X...X.....
//   Row 5: ...X.X......
//   Row 6: ....X.......
//   Row 7: ............
const uint32_t tickFrame[] = {
  0x00000400,
  0x80102201,
  0x40080000
};

// ── Runtime state ────────────────────────────────────────────────────
bool          provisioning  = false;
WiFiSSLClient wifiClient;
WebSocketClient* wsClient   = nullptr;

unsigned long lastHeartbeat  = 0;
unsigned long lastReconnect  = 0;
bool          wsConnected    = false;
bool          authenticated  = false;

// ── OTA (Over-the-Air firmware update) ───────────────────────────────
OTAUpdate     ota;

// ── Reed switch (gate state) ─────────────────────────────────────────
bool          lastGateOpen       = false;  // Last reported gate state
bool          gateStateReady     = false;  // True after first stable read
unsigned long lastDebounceTime   = 0;
bool          lastRawReading     = false;

// ── Forward declarations ─────────────────────────────────────────────
void connectWiFi();
void connectWebSocket();
void sendAuth();
void sendHeartbeat();
void handleMessage(const String& message);
void pulseRelay();
void sendAck(bool ok);
void sendGateState(bool isOpen);
void checkReedSwitch();
void performOTA(const char* url);
void sendOTAStatus(const char* status, const char* message);

// ─────────────────────────────────────────────────────────────────────
// setup()
// ─────────────────────────────────────────────────────────────────────
void setup() {
  Serial.begin(115200);
  unsigned long serialWait = millis();
  while (!Serial && millis() - serialWait < 3000) { ; }  // wait max 3 s

  // Initialise LED matrix
  matrix.begin();
  matrix.loadFrame(sadFrame);

  // Configure hardware pins
  pinMode(RELAY_PIN, OUTPUT);
  digitalWrite(RELAY_PIN, LOW);

  pinMode(REED_SWITCH_PIN, INPUT_PULLUP);  // LOW = gate closed (magnet near)

  pinMode(RESET_PIN, INPUT_PULLUP);

  Serial.println(F(""));
  Serial.println(F("─── Gate Controller ───"));
  Serial.print(F("Relay pin: "));
  Serial.println(RELAY_PIN);
  Serial.print(F("Reed switch pin: "));
  Serial.println(REED_SWITCH_PIN);
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

    // ── EEPROM migration: update server host/port for HTTPS ──
    DeviceConfig& cfg = getConfig();
    if (strcmp(cfg.serverHost, "gatecontroller.duckdns.org") != 0 || cfg.serverPort != 443) {
      Serial.println(F("[boot] Migrating EEPROM to WSS (gatecontroller.duckdns.org:443)"));
      strncpy(cfg.serverHost, "gatecontroller.duckdns.org", sizeof(cfg.serverHost) - 1);
      cfg.serverHost[sizeof(cfg.serverHost) - 1] = '\0';
      cfg.serverPort = 443;
      saveConfig(cfg);
      Serial.println(F("[boot] EEPROM migration complete"));
    }

    // Create WebSocket client with stored config
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

  // Check reed switch for gate state changes
  if (authenticated) {
    checkReedSwitch();
  }

  // Check if connection was lost
  if (!wsClient->connected()) {
    Serial.println(F("[ws] Connection lost"));
    wsConnected   = false;
    authenticated = false;
    matrix.loadFrame(sadFrame);  // Show sad face
  }
}

// ─────────────────────────────────────────────────────────────────────
// WiFi connection (uses EEPROM-stored credentials)
// ─────────────────────────────────────────────────────────────────────
void connectWiFi() {
  DeviceConfig& cfg = getConfig();
  Serial.print(F("[wifi] Connecting to "));
  Serial.println(cfg.ssid);

  // Ensure WiFi module is in a clean state (AP mode may persist across MCU reset)
  WiFi.disconnect();
  WiFi.end();
  delay(1000);

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
    matrix.loadFrame(heartFrame);  // Show heart on LED matrix
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
    matrix.loadFrame(sadFrame);  // Show sad face
    return;
  }

  // ── TOGGLE — server wants us to pulse the relay ─
  if (strcmp(type, "TOGGLE") == 0) {
    Serial.println(F("[cmd] TOGGLE received — pulsing relay"));
    pulseRelay();
    sendAck(true);
    // Show tick for 1 second, then return to heart
    matrix.loadFrame(tickFrame);
    delay(1000);
    matrix.loadFrame(heartFrame);
    return;
  }

  // ── OTA_UPDATE — server wants us to update firmware ─
  if (strcmp(type, "OTA_UPDATE") == 0) {
    const char* url = doc["url"];
    if (!url || strlen(url) == 0) {
      Serial.println(F("[ota] OTA_UPDATE missing 'url'"));
      sendOTAStatus("error", "Missing firmware URL");
      return;
    }
    Serial.print(F("[ota] OTA_UPDATE received — URL: "));
    Serial.println(url);
    sendOTAStatus("downloading", "Starting firmware download...");
    performOTA(url);
    // If we get here, OTA failed (success = reboot)
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

// ─────────────────────────────────────────────────────────────────────
// Check reed switch with debounce and report state changes
// ─────────────────────────────────────────────────────────────────────
void checkReedSwitch() {
  bool rawReading = (digitalRead(REED_SWITCH_PIN) == HIGH);  // HIGH = open (no magnet)

  // Reset debounce timer when reading changes
  if (rawReading != lastRawReading) {
    lastDebounceTime = millis();
    lastRawReading = rawReading;
  }

  // Wait for stable reading
  if ((millis() - lastDebounceTime) < DEBOUNCE_MS) {
    return;
  }

  // First stable read after boot — send initial state
  if (!gateStateReady) {
    gateStateReady = true;
    lastGateOpen = rawReading;
    Serial.print(F("[reed] Initial gate state: "));
    Serial.println(rawReading ? F("OPEN") : F("CLOSED"));
    sendGateState(rawReading);
    return;
  }

  // Only report on change
  if (rawReading != lastGateOpen) {
    lastGateOpen = rawReading;
    Serial.print(F("[reed] Gate state changed: "));
    Serial.println(rawReading ? F("OPEN") : F("CLOSED"));
    sendGateState(rawReading);
  }
}

// ─────────────────────────────────────────────────────────────────────
// Send GATE_STATE message over WebSocket
// ─────────────────────────────────────────────────────────────────────
void sendGateState(bool isOpen) {
  if (!wsConnected || !authenticated) return;

  JsonDocument doc;
  doc["type"]   = "GATE_STATE";
  doc["isOpen"] = isOpen;

  String payload;
  serializeJson(doc, payload);

  wsClient->beginMessage(TYPE_TEXT);
  wsClient->print(payload);
  wsClient->endMessage();

  Serial.print(F("[ws] GATE_STATE sent (isOpen="));
  Serial.print(isOpen ? "true" : "false");
  Serial.println(F(")"));
}

// ─────────────────────────────────────────────────────────────────────
// Send OTA_STATUS message over WebSocket
// ─────────────────────────────────────────────────────────────────────
void sendOTAStatus(const char* status, const char* message) {
  if (!wsConnected) return;

  JsonDocument doc;
  doc["type"]    = "OTA_STATUS";
  doc["status"]  = status;
  doc["message"] = message;

  String payload;
  serializeJson(doc, payload);

  wsClient->beginMessage(TYPE_TEXT);
  wsClient->print(payload);
  wsClient->endMessage();

  Serial.print(F("[ota] Status: "));
  Serial.print(status);
  Serial.print(F(" — "));
  Serial.println(message);
}

// ─────────────────────────────────────────────────────────────────────
// Perform OTA firmware update
// Downloads firmware from the given URL, verifies, and applies it.
// On success the board reboots — this function only returns on failure.
// EEPROM config (WiFi, server, token) survives the update.
// ─────────────────────────────────────────────────────────────────────
void performOTA(const char* url) {
  Serial.println(F("[ota] Beginning OTA update..."));

  // Step 1: Initialise OTA with local filename
  int err = ota.begin("/update.bin");
  if (err != 0) {
    Serial.print(F("[ota] begin() failed: "));
    Serial.println(err);
    sendOTAStatus("error", "OTA begin failed");
    return;
  }

  // Step 2: Download firmware from server
  Serial.print(F("[ota] Downloading from: "));
  Serial.println(url);
  err = ota.download(url, "/update.bin");
  if (err != 0) {
    Serial.print(F("[ota] download() failed: "));
    Serial.println(err);
    sendOTAStatus("error", "Firmware download failed");
    ota.reset();
    return;
  }
  Serial.println(F("[ota] Download complete"));
  sendOTAStatus("verifying", "Download complete, verifying...");

  // Step 3: Verify the downloaded firmware
  err = ota.verify();
  if (err != 0) {
    Serial.print(F("[ota] verify() failed: "));
    Serial.println(err);
    sendOTAStatus("error", "Firmware verification failed");
    ota.reset();
    return;
  }
  Serial.println(F("[ota] Verification passed"));

  // Step 4: Apply the update (board reboots on success)
  sendOTAStatus("applying", "Applying update — device will reboot...");
  delay(500);  // Give the WebSocket message time to send

  Serial.println(F("[ota] Applying update and rebooting..."));
  err = ota.update("/update.bin");

  // If we reach here, update() failed
  Serial.print(F("[ota] update() failed: "));
  Serial.println(err);
  sendOTAStatus("error", "Firmware apply failed");
  ota.reset();
}
