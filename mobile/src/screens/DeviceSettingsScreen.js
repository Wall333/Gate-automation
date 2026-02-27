import React, { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Alert,
  ActivityIndicator,
} from 'react-native';
import { useNavigation, useRoute } from '@react-navigation/native';
import { deleteDevice, updateDevice } from '../api';
import { useAuth } from '../AuthContext';
import Config from '../config';

export default function DeviceSettingsScreen() {
  const navigation = useNavigation();
  const route = useRoute();
  const { device } = route.params;
  const { isAdmin } = useAuth();

  const [name, setName] = useState(device.name);
  const [editingName, setEditingName] = useState(false);
  const [saving, setSaving] = useState(false);

  // Extract server info from Config
  let serverHost = '';
  let serverPort = '';
  try {
    const url = new URL(Config.SERVER_URL);
    serverHost = url.hostname;
    serverPort = url.port || '3000';
  } catch {
    serverHost = Config.SERVER_URL;
  }

  async function handleSaveName() {
    const trimmed = name.trim();
    if (!trimmed) {
      Alert.alert('Invalid', 'Device name cannot be empty.');
      return;
    }
    if (trimmed === device.name) {
      setEditingName(false);
      return;
    }
    setSaving(true);
    try {
      await updateDevice(device.id, { name: trimmed });
      device.name = trimmed; // update the object so other screens reflect it
      setName(trimmed);
      setEditingName(false);
    } catch (err) {
      Alert.alert('Error', err.message);
    } finally {
      setSaving(false);
    }
  }

  function handleCancelName() {
    setName(device.name);
    setEditingName(false);
  }

  function handleRemoveDevice() {
    Alert.alert(
      'Remove Device',
      `Are you sure you want to remove "${name}"?\n\nThe device will need to be factory-reset and re-provisioned to reconnect.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Remove',
          style: 'destructive',
          onPress: async () => {
            try {
              await deleteDevice(device.id);
              navigation.popToTop();
            } catch (err) {
              Alert.alert('Error', err.message);
            }
          },
        },
      ],
    );
  }

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      {/* Device Info */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Device</Text>
        <View style={styles.card}>
          {/* Editable Name */}
          <View style={styles.infoRow}>
            <Text style={styles.infoLabel}>Name</Text>
            {editingName ? (
              <View style={styles.editRow}>
                <TextInput
                  style={styles.editInput}
                  value={name}
                  onChangeText={setName}
                  maxLength={100}
                  autoFocus
                  selectTextOnFocus
                  onSubmitEditing={handleSaveName}
                  returnKeyType="done"
                />
                {saving ? (
                  <ActivityIndicator size="small" color="#007AFF" style={{ marginLeft: 8 }} />
                ) : (
                  <>
                    <TouchableOpacity onPress={handleSaveName} style={styles.editBtn}>
                      <Text style={styles.saveText}>Save</Text>
                    </TouchableOpacity>
                    <TouchableOpacity onPress={handleCancelName} style={styles.editBtn}>
                      <Text style={styles.cancelText}>Cancel</Text>
                    </TouchableOpacity>
                  </>
                )}
              </View>
            ) : (
              <TouchableOpacity
                style={styles.editableValue}
                onPress={() => setEditingName(true)}
              >
                <Text style={styles.infoValue}>{name}</Text>
                <Text style={styles.editIcon}>✎</Text>
              </TouchableOpacity>
            )}
          </View>

          <InfoRow label="ID" value={device.id} mono />
          <InfoRow
            label="Status"
            value={device.isOnline ? 'Online' : 'Offline'}
            valueColor={device.isOnline ? '#34C759' : '#FF3B30'}
          />
          {device.lastSeen && (
            <InfoRow
              label="Last Seen"
              value={new Date(device.lastSeen).toLocaleString()}
            />
          )}
          {device.createdAt && (
            <InfoRow
              label="Added"
              value={new Date(device.createdAt).toLocaleString()}
            />
          )}
        </View>
      </View>

      {/* Connection Info */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Server Connection</Text>
        <View style={styles.card}>
          <InfoRow label="Server Host" value={serverHost} mono />
          <InfoRow label="Server Port" value={serverPort} />
          <InfoRow label="Protocol" value="WebSocket (ws://)" />
          <InfoRow label="Endpoint" value="/device/ws" mono />
          <Text style={styles.cardNote}>
            Server connection is set during provisioning. To change it,
            factory-reset the device and re-provision via Add Device.
          </Text>
        </View>
      </View>

      {/* Network Info */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Network</Text>
        <View style={styles.card}>
          <InfoRow label="Provisioning AP" value="GateController" />
          <InfoRow label="AP Password" value="gatesetup" />
          <Text style={styles.cardNote}>
            To change WiFi credentials, factory-reset the device (hold pin 3
            LOW during boot) and re-provision via Add Device.
          </Text>
        </View>
      </View>

      {/* Actions */}
      {isAdmin && (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Actions</Text>
          <TouchableOpacity
            style={styles.dangerButton}
            onPress={handleRemoveDevice}
          >
            <Text style={styles.dangerButtonText}>Remove Device</Text>
          </TouchableOpacity>
          <Text style={styles.dangerNote}>
            Removes this device from the server. The Arduino will need to be
            factory-reset and re-provisioned.
          </Text>
        </View>
      )}
    </ScrollView>
  );
}

function InfoRow({ label, value, mono, valueColor }) {
  return (
    <View style={styles.infoRow}>
      <Text style={styles.infoLabel}>{label}</Text>
      <Text
        style={[
          styles.infoValue,
          mono && styles.mono,
          valueColor && { color: valueColor },
        ]}
        selectable
        numberOfLines={1}
      >
        {value}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f5f5f5',
  },
  content: {
    padding: 16,
    paddingBottom: 40,
  },
  section: {
    marginBottom: 24,
  },
  sectionTitle: {
    fontSize: 13,
    fontWeight: '600',
    color: '#888',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 8,
    marginLeft: 4,
  },
  card: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 16,
    elevation: 1,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
  },
  cardNote: {
    fontSize: 12,
    color: '#999',
    marginTop: 12,
    fontStyle: 'italic',
    lineHeight: 18,
  },
  infoRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#f0f0f0',
  },
  infoLabel: {
    fontSize: 15,
    color: '#555',
    flex: 1,
  },
  infoValue: {
    fontSize: 15,
    color: '#1a1a1a',
    fontWeight: '500',
    flex: 1.5,
    textAlign: 'right',
  },
  mono: {
    fontFamily: 'monospace',
    fontSize: 13,
  },
  editableValue: {
    flex: 1.5,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
  },
  editIcon: {
    fontSize: 16,
    color: '#007AFF',
    marginLeft: 6,
  },
  editRow: {
    flex: 1.5,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
  },
  editInput: {
    flex: 1,
    fontSize: 15,
    fontWeight: '500',
    color: '#1a1a1a',
    borderBottomWidth: 1.5,
    borderBottomColor: '#007AFF',
    paddingVertical: 2,
    paddingHorizontal: 4,
    textAlign: 'right',
  },
  editBtn: {
    marginLeft: 8,
    paddingVertical: 4,
    paddingHorizontal: 6,
  },
  saveText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#007AFF',
  },
  cancelText: {
    fontSize: 14,
    color: '#999',
  },
  dangerButton: {
    backgroundColor: '#FF3B30',
    borderRadius: 10,
    paddingVertical: 14,
    alignItems: 'center',
  },
  dangerButtonText: {
    fontSize: 16,
    fontWeight: '700',
    color: '#fff',
  },
  dangerNote: {
    fontSize: 12,
    color: '#999',
    marginTop: 8,
    textAlign: 'center',
    fontStyle: 'italic',
  },
});
