// ─── API & Auth Configuration ────────────────────────────────────────
// Update SERVER_URL to your server's address before building.

const Config = {
  // Server base URL (no trailing slash)
  SERVER_URL: 'https://gatecontroller.duckdns.org',

  // Google OAuth Client ID (must match server's GOOGLE_CLIENT_ID)
  GOOGLE_CLIENT_ID: '993279981060-32397kmo74t1h1g07k0mnc8nbrt6o50d.apps.googleusercontent.com',

  // Arduino provisioning AP defaults
  ARDUINO_AP_IP: '192.168.4.1',       // Default AP IP for Arduino
  ARDUINO_AP_PORT: 80,
};

export default Config;
