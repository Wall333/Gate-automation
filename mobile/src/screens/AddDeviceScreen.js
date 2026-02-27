import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
  PermissionsAndroid,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import Config from '../config';
import { registerDevice } from '../api';

// Try to import WiFi module (only works in production builds)
let WifiManager = null;
try {
  WifiManager = require('react-native-wifi-reborn').default;
} catch {
  // Not available in Expo Go
}

export default function AddDeviceScreen() {
  const navigation = useNavigation();

  const [ssid, setSsid] = useState('');
  const [password, setPassword] = useState('');
  const [deviceName, setDeviceName] = useState('Gate Controller');
  const [step, setStep] = useState('form'); // 'form' | 'registering' | 'connecting' | 'done'
  const [error, setError] = useState(null);
  const [showPassword, setShowPassword] = useState(false);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [serverHost, setServerHost] = useState('');
  const [serverPort, setServerPort] = useState('');

  // Extract host/port from Config.SERVER_URL
  useEffect(() => {
    try {
      const url = new URL(Config.SERVER_URL);
      setServerHost(url.hostname);
      setServerPort(url.port || '3000');
    } catch {
      setServerHost('');
      setServerPort('3000');
    }
  }, []);

  // Try to auto-detect WiFi SSID
  useEffect(() => {
    async function detectSsid() {
      if (!WifiManager) return;
      try {
        if (Platform.OS === 'android') {
          const granted = await PermissionsAndroid.request(
            PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION,
            {
              title: 'Location Permission',
              message: 'We need location access to detect your WiFi network name.',
              buttonPositive: 'OK',
            },
          );
          if (granted !== PermissionsAndroid.RESULTS.GRANTED) return;
        }
        const currentSsid = await WifiManager.getCurrentWifiSSID();
        if (currentSsid && currentSsid !== '<unknown ssid>') {
          setSsid(currentSsid);
        }
      } catch {
        // Silently fail — user can type it manually
      }
    }
    detectSsid();
  }, []);

  async function handleProvision() {
    if (!ssid || !password) {
      Alert.alert('Missing Fields', 'Please enter your WiFi name and password.');
      return;
    }

    const host = serverHost;
    const port = serverPort;

    if (!host) {
      Alert.alert('Missing Server', 'Server host is not configured.');
      return;
    }

    setStep('registering');
    setError(null);

    // Step 1: Register device on the server and get a token
    let deviceToken;
    try {
      const result = await registerDevice(deviceName);
      deviceToken = result.token;
    } catch (err) {
      setError(`Failed to register device: ${err.message}`);
      setStep('form');
      return;
    }

    setStep('connecting');

    // Step 2: Send config to the Arduino
    try {
      const statusRes = await fetch(
        `http://${Config.ARDUINO_AP_IP}:${Config.ARDUINO_AP_PORT}/status`,
        { method: 'GET' },
      );

      if (!statusRes.ok) {
        throw new Error('Cannot reach the device. Are you connected to the GateController WiFi?');
      }

      const configRes = await fetch(
        `http://${Config.ARDUINO_AP_IP}:${Config.ARDUINO_AP_PORT}/configure`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            ssid,
            password,
            serverHost: host,
            serverPort: parseInt(port, 10) || 3000,
            deviceToken,
          }),
        },
      );

      const data = await configRes.json();

      if (!configRes.ok) {
        throw new Error(data.error || 'Configuration failed');
      }

      setStep('done');
    } catch (err) {
      setError(err.message);
      setStep('form');
    }
  }

  if (step === 'done') {
    return (
      <View style={styles.centerContainer}>
        <Text style={styles.successIcon}>✅</Text>
        <Text style={styles.successTitle}>Device Configured!</Text>
        <Text style={styles.successText}>
          The device is rebooting and will connect to your WiFi network. It
          should appear in your devices list within 30 seconds.
        </Text>
        <Text style={styles.wifiHint}>
          Switch back to your regular WiFi network now.
        </Text>
        <TouchableOpacity
          style={styles.doneButton}
          onPress={() => navigation.goBack()}
        >
          <Text style={styles.doneButtonText}>Back to Devices</Text>
        </TouchableOpacity>
      </View>
    );
  }

  const isWorking = step === 'registering' || step === 'connecting';

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      <ScrollView contentContainerStyle={styles.scrollContent}>
        {/* Instructions */}
        <View style={styles.instructionBox}>
          <Text style={styles.instructionTitle}>Setup Instructions</Text>
          <Text style={styles.instructionText}>
            1. Power on your Arduino gate controller{'\n'}
            2. Go to your phone's WiFi settings{'\n'}
            3. Connect to the <Text style={styles.bold}>GateController</Text>{' '}
            network (password: <Text style={styles.bold}>gatesetup</Text>){'\n'}
            4. Come back here and fill in the form below
          </Text>
        </View>

        {error && (
          <View style={styles.errorBox}>
            <Text style={styles.errorText}>{error}</Text>
          </View>
        )}

        {/* Form */}
        <Text style={styles.sectionTitle}>WiFi Credentials</Text>

        <Text style={styles.label}>WiFi Network Name (SSID)</Text>
        <TextInput
          style={styles.input}
          value={ssid}
          onChangeText={setSsid}
          placeholder="Your home WiFi SSID"
          autoCapitalize="none"
        />

        <Text style={styles.label}>WiFi Password</Text>
        <View style={styles.passwordRow}>
          <TextInput
            style={[styles.input, styles.passwordInput]}
            value={password}
            onChangeText={setPassword}
            placeholder="WiFi password"
            secureTextEntry={!showPassword}
            autoCapitalize="none"
          />
        </View>
        <TouchableOpacity
          style={styles.showPasswordRow}
          onPress={() => setShowPassword(!showPassword)}
        >
          <View style={styles.checkbox}>
            {showPassword && <View style={styles.checkboxFill} />}
          </View>
          <Text style={styles.showPasswordText}>Show password</Text>
        </TouchableOpacity>

        {/* Device name */}
        <Text style={styles.sectionTitle}>Device</Text>
        <Text style={styles.label}>Device Name</Text>
        <TextInput
          style={styles.input}
          value={deviceName}
          onChangeText={setDeviceName}
          placeholder="Gate Controller"
        />

        {/* Advanced (collapsed by default) */}
        <TouchableOpacity
          style={styles.advancedToggle}
          onPress={() => setShowAdvanced(!showAdvanced)}
        >
          <Text style={styles.advancedToggleText}>
            {showAdvanced ? '▼' : '▶'} Advanced Settings
          </Text>
        </TouchableOpacity>

        {showAdvanced && (
          <View style={styles.advancedBox}>
            <Text style={styles.label}>Server Host</Text>
            <TextInput
              style={styles.input}
              value={serverHost}
              onChangeText={setServerHost}
              placeholder="e.g. 192.168.1.100"
              autoCapitalize="none"
              keyboardType="url"
            />

            <Text style={styles.label}>Server Port</Text>
            <TextInput
              style={styles.input}
              value={serverPort}
              onChangeText={setServerPort}
              placeholder="3000"
              keyboardType="numeric"
            />

            <Text style={styles.advancedNote}>
              Server details are auto-filled from your app configuration.
              Only change these if you know what you're doing.
            </Text>
          </View>
        )}

        <TouchableOpacity
          style={[styles.provisionButton, isWorking && styles.disabledButton]}
          onPress={handleProvision}
          disabled={isWorking}
        >
          {isWorking ? (
            <View style={styles.loadingRow}>
              <ActivityIndicator color="#fff" />
              <Text style={styles.provisionButtonText}>
                {step === 'registering' ? '  Registering device...' : '  Configuring...'}
              </Text>
            </View>
          ) : (
            <Text style={styles.provisionButtonText}>Configure Device</Text>
          )}
        </TouchableOpacity>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f5f5f5',
  },
  scrollContent: {
    padding: 16,
    paddingBottom: 40,
  },
  centerContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
    backgroundColor: '#f5f5f5',
  },
  instructionBox: {
    backgroundColor: '#E8F4FD',
    borderRadius: 12,
    padding: 16,
    marginBottom: 20,
  },
  instructionTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#0C5DA5',
    marginBottom: 8,
  },
  instructionText: {
    fontSize: 14,
    color: '#333',
    lineHeight: 22,
  },
  bold: {
    fontWeight: '700',
  },
  errorBox: {
    backgroundColor: '#F8D7DA',
    borderRadius: 8,
    padding: 12,
    marginBottom: 16,
  },
  errorText: {
    color: '#721C24',
    fontSize: 14,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#1a1a1a',
    marginTop: 16,
    marginBottom: 8,
  },
  label: {
    fontSize: 13,
    color: '#666',
    marginBottom: 4,
    marginTop: 8,
  },
  input: {
    backgroundColor: '#fff',
    borderRadius: 8,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 16,
    borderWidth: 1,
    borderColor: '#e0e0e0',
  },
  passwordRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  passwordInput: {
    flex: 1,
  },
  showPasswordRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 8,
    marginBottom: 4,
  },
  checkbox: {
    width: 20,
    height: 20,
    borderRadius: 4,
    borderWidth: 2,
    borderColor: '#4285F4',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 8,
  },
  checkboxFill: {
    width: 12,
    height: 12,
    borderRadius: 2,
    backgroundColor: '#4285F4',
  },
  showPasswordText: {
    fontSize: 14,
    color: '#666',
  },
  advancedToggle: {
    marginTop: 20,
    marginBottom: 4,
  },
  advancedToggleText: {
    fontSize: 14,
    color: '#4285F4',
    fontWeight: '600',
  },
  advancedBox: {
    backgroundColor: '#FAFAFA',
    borderRadius: 8,
    padding: 12,
    borderWidth: 1,
    borderColor: '#e0e0e0',
    marginBottom: 4,
  },
  advancedNote: {
    fontSize: 12,
    color: '#999',
    marginTop: 8,
    fontStyle: 'italic',
  },
  loadingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
  provisionButton: {
    backgroundColor: '#34C759',
    borderRadius: 8,
    paddingVertical: 16,
    alignItems: 'center',
    marginTop: 24,
  },
  disabledButton: {
    opacity: 0.6,
  },
  provisionButtonText: {
    fontSize: 16,
    fontWeight: '700',
    color: '#fff',
  },
  successIcon: {
    fontSize: 64,
    marginBottom: 16,
  },
  successTitle: {
    fontSize: 22,
    fontWeight: '700',
    color: '#1a1a1a',
    marginBottom: 12,
  },
  successText: {
    fontSize: 15,
    color: '#555',
    textAlign: 'center',
    marginBottom: 8,
  },
  wifiHint: {
    fontSize: 13,
    color: '#888',
    textAlign: 'center',
    marginBottom: 24,
    fontStyle: 'italic',
  },
  doneButton: {
    backgroundColor: '#4285F4',
    borderRadius: 8,
    paddingVertical: 14,
    paddingHorizontal: 32,
  },
  doneButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#fff',
  },
});
