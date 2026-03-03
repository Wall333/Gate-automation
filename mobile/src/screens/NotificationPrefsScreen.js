import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  Switch,
  StyleSheet,
  ActivityIndicator,
  ScrollView,
  TouchableOpacity,
  Alert,
} from 'react-native';
import { getNotificationPreferences, updateNotificationPreferences } from '../api';

const DURATION_OPTIONS = [1, 2, 5, 10, 15, 30];

export default function NotificationPrefsScreen() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [prefs, setPrefs] = useState({
    notifyOnOpen: false,
    notifyOnClose: false,
    openTooLongMin: null,
  });

  // ── Fetch current preferences ────────────────────────
  useEffect(() => {
    (async () => {
      try {
        const data = await getNotificationPreferences();
        setPrefs(data);
      } catch (err) {
        Alert.alert('Error', 'Failed to load notification preferences.');
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  // ── Save preferences (debounced on change) ───────────
  const savePrefs = useCallback(async (newPrefs) => {
    setSaving(true);
    try {
      await updateNotificationPreferences(newPrefs);
    } catch (err) {
      Alert.alert('Error', 'Failed to save preferences.');
    } finally {
      setSaving(false);
    }
  }, []);

  const toggleOpen = () => {
    const newPrefs = { ...prefs, notifyOnOpen: !prefs.notifyOnOpen };
    setPrefs(newPrefs);
    savePrefs(newPrefs);
  };

  const toggleClose = () => {
    const newPrefs = { ...prefs, notifyOnClose: !prefs.notifyOnClose };
    setPrefs(newPrefs);
    savePrefs(newPrefs);
  };

  const toggleOpenTooLong = () => {
    const enabled = prefs.openTooLongMin !== null;
    const newPrefs = {
      ...prefs,
      openTooLongMin: enabled ? null : 5, // Default to 5 minutes
    };
    setPrefs(newPrefs);
    savePrefs(newPrefs);
  };

  const selectDuration = (minutes) => {
    const newPrefs = { ...prefs, openTooLongMin: minutes };
    setPrefs(newPrefs);
    savePrefs(newPrefs);
  };

  // ── Render ───────────────────────────────────────────
  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color="#4285F4" />
      </View>
    );
  }

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <Text style={styles.sectionHeader}>Notify me when…</Text>

      {/* Gate opened */}
      <View style={styles.row}>
        <View style={styles.rowText}>
          <Text style={styles.rowTitle}>Gate opens</Text>
          <Text style={styles.rowSub}>Get a notification whenever the gate is opened</Text>
        </View>
        <Switch
          value={prefs.notifyOnOpen}
          onValueChange={toggleOpen}
          trackColor={{ true: '#4285F4' }}
        />
      </View>

      {/* Gate closed */}
      <View style={styles.row}>
        <View style={styles.rowText}>
          <Text style={styles.rowTitle}>Gate closes</Text>
          <Text style={styles.rowSub}>Get a notification whenever the gate is closed</Text>
        </View>
        <Switch
          value={prefs.notifyOnClose}
          onValueChange={toggleClose}
          trackColor={{ true: '#4285F4' }}
        />
      </View>

      {/* Open too long */}
      <View style={styles.row}>
        <View style={styles.rowText}>
          <Text style={styles.rowTitle}>Gate open too long</Text>
          <Text style={styles.rowSub}>Alert if the gate stays open longer than a set time</Text>
        </View>
        <Switch
          value={prefs.openTooLongMin !== null}
          onValueChange={toggleOpenTooLong}
          trackColor={{ true: '#4285F4' }}
        />
      </View>

      {/* Duration picker (shown when open-too-long is enabled) */}
      {prefs.openTooLongMin !== null && (
        <View style={styles.durationSection}>
          <Text style={styles.durationLabel}>Alert after:</Text>
          <View style={styles.durationRow}>
            {DURATION_OPTIONS.map((min) => (
              <TouchableOpacity
                key={min}
                style={[
                  styles.durationChip,
                  prefs.openTooLongMin === min && styles.durationChipActive,
                ]}
                onPress={() => selectDuration(min)}
              >
                <Text
                  style={[
                    styles.durationChipText,
                    prefs.openTooLongMin === min && styles.durationChipTextActive,
                  ]}
                >
                  {min} min
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>
      )}

      {saving && (
        <Text style={styles.savingText}>Saving…</Text>
      )}

      <Text style={styles.note}>
        Notifications are sent as push alerts. Make sure notifications are enabled for this app in your phone's settings.
      </Text>
    </ScrollView>
  );
}

// ── Styles ───────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  center: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  container: {
    flex: 1,
    backgroundColor: '#F5F5F5',
  },
  content: {
    paddingBottom: 40,
  },
  sectionHeader: {
    fontSize: 13,
    fontWeight: '600',
    color: '#888',
    textTransform: 'uppercase',
    paddingHorizontal: 16,
    paddingTop: 20,
    paddingBottom: 8,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fff',
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#E0E0E0',
  },
  rowText: {
    flex: 1,
    marginRight: 12,
  },
  rowTitle: {
    fontSize: 16,
    fontWeight: '500',
    color: '#1A1A1A',
  },
  rowSub: {
    fontSize: 13,
    color: '#888',
    marginTop: 2,
  },
  durationSection: {
    backgroundColor: '#fff',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#E0E0E0',
  },
  durationLabel: {
    fontSize: 14,
    color: '#555',
    marginBottom: 8,
  },
  durationRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  durationChip: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 20,
    backgroundColor: '#ECECEC',
  },
  durationChipActive: {
    backgroundColor: '#4285F4',
  },
  durationChipText: {
    fontSize: 14,
    color: '#555',
    fontWeight: '500',
  },
  durationChipTextActive: {
    color: '#fff',
  },
  savingText: {
    fontSize: 13,
    color: '#4285F4',
    textAlign: 'center',
    marginTop: 12,
  },
  note: {
    fontSize: 13,
    color: '#AAA',
    textAlign: 'center',
    paddingHorizontal: 24,
    marginTop: 24,
    lineHeight: 18,
  },
});
