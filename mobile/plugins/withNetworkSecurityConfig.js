/**
 * Expo config plugin to add a custom Android network security config.
 * This explicitly allows cleartext (HTTP) traffic to any host.
 * Required because usesCleartextTraffic alone isn't always sufficient.
 */
const { withAndroidManifest } = require('expo/config-plugins');
const { writeFileSync, mkdirSync, existsSync } = require('fs');
const { join } = require('path');

const NETWORK_SECURITY_CONFIG = `<?xml version="1.0" encoding="utf-8"?>
<network-security-config>
  <base-config cleartextTrafficPermitted="true">
    <trust-anchors>
      <certificates src="system" />
    </trust-anchors>
  </base-config>
</network-security-config>
`;

function withNetworkSecurityConfig(config) {
  return withAndroidManifest(config, async (config) => {
    const mainApplication = config.modResults.manifest.application?.[0];
    if (mainApplication) {
      mainApplication.$['android:networkSecurityConfig'] =
        '@xml/network_security_config';
    }

    // Write the network_security_config.xml file
    const resDir = join(
      config.modRequest.platformProjectRoot,
      'app',
      'src',
      'main',
      'res',
      'xml',
    );
    if (!existsSync(resDir)) {
      mkdirSync(resDir, { recursive: true });
    }
    writeFileSync(
      join(resDir, 'network_security_config.xml'),
      NETWORK_SECURITY_CONFIG,
    );

    return config;
  });
}

module.exports = withNetworkSecurityConfig;
