import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { toggleGate } from '../api';

export default function DeviceDetailScreen({ route }) {
  const navigation = useNavigation();
  const { device } = route.params;
  const [toggling, setToggling] = useState(false);
  const [lastResult, setLastResult] = useState(null);

  async function handleToggle() {
    setToggling(true);
    setLastResult(null);
    try {
      const result = await toggleGate(device.id);
      setLastResult({
        ok: result.ok,
        message: result.ok
          ? 'Gate toggled successfully!'
          : `Failed: ${result.result || 'Unknown error'}`,
      });
    } catch (err) {
      setLastResult({ ok: false, message: err.message });
      Alert.alert('Error', err.message);
    } finally {
      setToggling(false);
    }
  }

  return (
    <View style={styles.container}>
      {/* Device info card */}
      <View style={styles.infoCard}>
        <View style={styles.infoCardHeader}>
          <Text style={styles.deviceName}>{device.name}</Text>
          <TouchableOpacity
            style={styles.settingsButton}
            onPress={() => navigation.navigate('DeviceSettings', { device })}
            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
          >
            <Text style={styles.settingsIcon}>⚙️</Text>
          </TouchableOpacity>
        </View>

        <View style={styles.statusRow}>
          <View
            style={[
              styles.statusDot,
              { backgroundColor: device.isOnline ? '#34C759' : '#FF3B30' },
            ]}
          />
          <Text
            style={[
              styles.statusText,
              { color: device.isOnline ? '#34C759' : '#FF3B30' },
            ]}
          >
            {device.isOnline ? 'Online' : 'Offline'}
          </Text>
        </View>

        {device.lastSeen && (
          <Text style={styles.lastSeen}>
            Last seen: {new Date(device.lastSeen).toLocaleString()}
          </Text>
        )}
      </View>

      {/* Toggle button */}
      <TouchableOpacity
        style={[
          styles.toggleButton,
          !device.isOnline && styles.toggleDisabled,
          toggling && styles.toggleActive,
        ]}
        onPress={handleToggle}
        disabled={!device.isOnline || toggling}
      >
        {toggling ? (
          <ActivityIndicator color="#fff" size="large" />
        ) : (
          <>
            <View style={styles.toggleSwitchIcon}>
              <View style={styles.switchTrack}>
                <View style={[styles.switchThumb, device.isOnline && styles.switchThumbOn]} />
              </View>
            </View>
            <Text style={styles.toggleText}>TOGGLE GATE</Text>
          </>
        )}
      </TouchableOpacity>

      {!device.isOnline && (
        <Text style={styles.offlineHint}>
          Device is offline. Cannot send commands.
        </Text>
      )}

      {/* Result feedback */}
      {lastResult && (
        <View
          style={[
            styles.resultBox,
            { backgroundColor: lastResult.ok ? '#D4EDDA' : '#F8D7DA' },
          ]}
        >
          <Text
            style={[
              styles.resultText,
              { color: lastResult.ok ? '#155724' : '#721C24' },
            ]}
          >
            {lastResult.message}
          </Text>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f5f5f5',
    padding: 16,
  },
  infoCard: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 20,
    marginBottom: 24,
    elevation: 1,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
  },
  deviceName: {
    fontSize: 24,
    fontWeight: '700',
    color: '#1a1a1a',
    marginBottom: 12,
    flex: 1,
  },
  infoCardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
  },
  settingsButton: {
    padding: 4,
  },
  settingsIcon: {
    fontSize: 22,
  },
  statusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
  },
  statusDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    marginRight: 8,
  },
  statusText: {
    fontSize: 16,
    fontWeight: '600',
  },
  lastSeen: {
    fontSize: 13,
    color: '#888',
  },
  toggleButton: {
    backgroundColor: '#4285F4',
    borderRadius: 16,
    paddingVertical: 24,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
    elevation: 3,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.15,
    shadowRadius: 4,
  },
  toggleDisabled: {
    backgroundColor: '#ccc',
  },
  toggleActive: {
    backgroundColor: '#3367D6',
  },
  toggleSwitchIcon: {
    marginBottom: 10,
  },
  switchTrack: {
    width: 56,
    height: 30,
    borderRadius: 15,
    backgroundColor: 'rgba(255,255,255,0.3)',
    justifyContent: 'center',
    paddingHorizontal: 3,
  },
  switchThumb: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: '#fff',
  },
  switchThumbOn: {
    alignSelf: 'flex-end',
  },
  toggleText: {
    fontSize: 20,
    fontWeight: '700',
    color: '#fff',
    letterSpacing: 2,
  },
  offlineHint: {
    textAlign: 'center',
    color: '#888',
    fontSize: 13,
    marginBottom: 16,
  },
  resultBox: {
    borderRadius: 8,
    padding: 12,
    marginTop: 8,
  },
  resultText: {
    fontSize: 14,
    fontWeight: '500',
    textAlign: 'center',
  },
});
