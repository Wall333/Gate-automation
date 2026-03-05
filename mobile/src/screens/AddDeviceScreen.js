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
import { registerDevice, deleteDevice } from '../api';

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
  const [step, setStep] = useState('form'); // 'form' | 'registering' | 'switchWifi' | 'connecting' | 'done'
  const [error, setError] = useState(null);
  const [showPassword, setShowPassword] = useState(false);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [serverHost, setServerHost] = useState('');
  const [serverPort, setServerPort] = useState('');
  const [deviceToken, setDeviceToken] = useState(null);
  const [registeredDeviceId, setRegisteredDeviceId] = useState(null);

  // Clean up: delete device from server if user leaves before finishing Arduino config
  // Block navigation while sending config to Arduino
  useEffect(() => {
    const unsubscribe = navigation.addListener('beforeRemove', (e) => {
      if (step === 'connecting') {
        // Prevent leaving while config is being sent
        e.preventDefault();
        return;
      }
      if (registeredDeviceId && step !== 'done') {
        deleteDevice(registeredDeviceId).catch(() => {});
      }
    });
    return unsubscribe;
  }, [navigation, registeredDeviceId, step]);

  // Extract host/port from Config.SERVER_URL
  useEffect(() => {
    try {
      const url = new URL(Config.SERVER_URL);
      setServerHost(url.hostname);
      setServerPort(url.port || (url.protocol === 'https:' ? '443' : '3000'));
    } catch {
      setServerHost('');
      setServerPort('443');
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

  // Phase 1: Register device on the cloud server (while on home WiFi)
  async function handleRegister() {
    if (!ssid || !password) {
      Alert.alert('Missing Fields', 'Please enter your WiFi name and password.');
      return;
    }

    const host = serverHost;
    if (!host) {
      Alert.alert('Missing Server', 'Server host is not configured.');
      return;
    }

    setStep('registering');
    setError(null);

    try {
      const result = await registerDevice(deviceName);
      setDeviceToken(result.token);
      setRegisteredDeviceId(result.id);
      setStep('switchWifi');
    } catch (err) {
      setError(`Failed to register device: ${err.message}`);
      setStep('form');
    }
  }

  // Phase 2: Send config to Arduino (after user switches to GateController AP)
  async function handleSendConfig() {
    setStep('connecting');
    setError(null);

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
            serverHost,
            serverPort: parseInt(serverPort, 10) || 443,
            deviceToken,
          }),
        },
      );

      const data = await configRes.json();

      if (!configRes.ok) {
        throw new Error(data.error || 'Configuration failed');
      }

      setRegisteredDeviceId(null); // Success — don't clean up on exit
      setStep('done');
    } catch (err) {
      setError(err.message);
      setStep('switchWifi');
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

  // Step 2: User needs to switch to Arduino AP
  if (step === 'switchWifi' || step === 'connecting') {
    return (
      <View style={styles.centerContainer}>
        <Text style={styles.successIcon}>📡</Text>
        <Text style={styles.successTitle}>Now Connect to Arduino</Text>
        <Text style={styles.successText}>
          Device registered on server! Now:{'\n\n'}
          1. Open your phone's <Text style={styles.bold}>WiFi Settings</Text>{'\n'}
          2. Connect to <Text style={styles.bold}>GateController</Text>{'\n'}
          {'   '}(password: <Text style={styles.bold}>gatesetup</Text>){'\n'}
          3. Come back here and tap the button below
        </Text>

        {error && (
          <View style={[styles.errorBox, { marginTop: 16, width: '100%' }]}>
            <Text style={styles.errorText}>{error}</Text>
          </View>
        )}

        <TouchableOpacity
          style={[styles.provisionButton, { width: '100%', marginTop: 24 }, step === 'connecting' && styles.disabledButton]}
          onPress={handleSendConfig}
          disabled={step === 'connecting'}
        >
          {step === 'connecting' ? (
            <View style={styles.loadingRow}>
              <ActivityIndicator color="#fff" />
              <Text style={styles.provisionButtonText}>  Sending config...</Text>
            </View>
          ) : (
            <Text style={styles.provisionButtonText}>Send Configuration to Arduino</Text>
          )}
        </TouchableOpacity>

        {step !== 'connecting' && (
          <TouchableOpacity
            style={{ marginTop: 16 }}
            onPress={async () => {
              // Clean up the registered device since user is going back
              if (registeredDeviceId) {
                try { await deleteDevice(registeredDeviceId); } catch { /* ignore */ }
                setRegisteredDeviceId(null);
              }
              setDeviceToken(null);
              setStep('form');
              setError(null);
            }}
          >
            <Text style={{ color: '#4285F4', fontSize: 14 }}>← Back to form</Text>
          </TouchableOpacity>
        )}
      </View>
    );
  }

  const isRegistering = step === 'registering';

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      <ScrollView contentContainerStyle={styles.scrollContent}>
        {/* Instructions */}
        <View style={styles.instructionBox}>
          <Text style={styles.instructionTitle}>Step 1: Enter WiFi Details</Text>
          <Text style={styles.instructionText}>
            Make sure you're on your <Text style={styles.bold}>home WiFi</Text> (not the Arduino).{' '}
            Enter your WiFi credentials below, then we'll register the device on the server.{' '}
            You'll switch to the Arduino's WiFi in the next step.
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
          {!showPassword && password.length > 0 && (
            <Text style={[styles.input, styles.passwordInput, styles.bulletOverlay]} pointerEvents="none">
              {'\u2022'.repeat(password.length)}
            </Text>
          )}
          <TextInput
            style={[styles.input, styles.passwordInput, !showPassword && styles.hiddenText]}
            value={password}
            onChangeText={setPassword}
            placeholder="WiFi password"
            autoCapitalize="none"
            autoCorrect={false}
            autoComplete="off"
            textContentType="none"
            keyboardType="default"
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
              placeholder="443"
              keyboardType="numeric"
            />

            <Text style={styles.advancedNote}>
              Server details are auto-filled from your app configuration.
              Only change these if you know what you're doing.
            </Text>
          </View>
        )}

        <TouchableOpacity
          style={[styles.provisionButton, isRegistering && styles.disabledButton]}
          onPress={handleRegister}
          disabled={isRegistering}
        >
          {isRegistering ? (
            <View style={styles.loadingRow}>
              <ActivityIndicator color="#fff" />
              <Text style={styles.provisionButtonText}>  Registering device...</Text>
            </View>
          ) : (
            <Text style={styles.provisionButtonText}>Register & Continue</Text>
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
  hiddenText: {
    color: 'transparent',
  },
  bulletOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    zIndex: 1,
    color: '#1a1a1a',
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
