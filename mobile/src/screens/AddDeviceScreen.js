import React, { useState } from 'react';
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
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import Config from '../config';

export default function AddDeviceScreen() {
  const navigation = useNavigation();

  const [ssid, setSsid] = useState('');
  const [password, setPassword] = useState('');
  const [serverHost, setServerHost] = useState('');
  const [serverPort, setServerPort] = useState('3000');
  const [deviceToken, setDeviceToken] = useState('');
  const [step, setStep] = useState('form'); // 'form' | 'connecting' | 'done'
  const [error, setError] = useState(null);

  async function handleProvision() {
    if (!ssid || !password || !serverHost || !deviceToken) {
      Alert.alert('Missing Fields', 'Please fill in all fields.');
      return;
    }

    setStep('connecting');
    setError(null);

    try {
      // First, check if we can reach the Arduino's provisioning server
      const statusRes = await fetch(
        `http://${Config.ARDUINO_AP_IP}:${Config.ARDUINO_AP_PORT}/status`,
        { method: 'GET' },
      );

      if (!statusRes.ok) {
        throw new Error('Cannot reach the device. Are you connected to the GateController WiFi?');
      }

      // Send configuration
      const configRes = await fetch(
        `http://${Config.ARDUINO_AP_IP}:${Config.ARDUINO_AP_PORT}/configure`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            ssid,
            password,
            serverHost,
            serverPort: parseInt(serverPort, 10) || 3000,
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
        <TextInput
          style={styles.input}
          value={password}
          onChangeText={setPassword}
          placeholder="WiFi password"
          secureTextEntry
        />

        <Text style={styles.sectionTitle}>Server Connection</Text>
        <Text style={styles.label}>Server Host (IP or domain)</Text>
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

        <Text style={styles.sectionTitle}>Device Authentication</Text>
        <Text style={styles.label}>Device Token</Text>
        <TextInput
          style={styles.input}
          value={deviceToken}
          onChangeText={setDeviceToken}
          placeholder="Shared secret from server .env"
          autoCapitalize="none"
        />

        <TouchableOpacity
          style={[styles.provisionButton, step === 'connecting' && styles.disabledButton]}
          onPress={handleProvision}
          disabled={step === 'connecting'}
        >
          {step === 'connecting' ? (
            <ActivityIndicator color="#fff" />
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
