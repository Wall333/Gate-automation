import React from 'react';
import { View, Text, StyleSheet, Image, ScrollView, Linking, TouchableOpacity } from 'react-native';
import Constants from 'expo-constants';
import * as Application from 'expo-application';
import { useAuth } from '../AuthContext';

const appVersion = Constants.expoConfig?.version ?? Application.nativeApplicationVersion ?? '—';
const buildNumber = Application.nativeBuildVersion ?? '—';
const appName = Constants.expoConfig?.name ?? 'Gate Controller';

export default function AboutScreen() {
  const { user } = useAuth();

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      {/* App icon + name */}
      <View style={styles.header}>
        <Image source={require('../../assets/icon.png')} style={styles.logo} />
        <Text style={styles.appName}>{appName}</Text>
        <Text style={styles.version}>v{appVersion}</Text>
        <Text style={styles.build}>Build {buildNumber}</Text>
      </View>

      {/* Info cards */}
      <View style={styles.card}>
        <InfoRow label="Version" value={`v${appVersion}`} />
        <InfoRow label="Build" value={buildNumber} />
        <InfoRow label="Signed in as" value={user?.name || user?.email || '—'} />
        <InfoRow label="Role" value={user?.role || '—'} last />
      </View>

      <Text style={styles.sectionTitle}>About</Text>
      <View style={styles.card}>
        <Text style={styles.description}>
          Gate Controller lets you open and close your gate from anywhere using
          your phone. It connects to an Arduino UNO R4 WiFi relay controller over
          your local network and provides real‑time state monitoring, activity
          logging, and push notifications.
        </Text>
      </View>

      <Text style={styles.sectionTitle}>Links</Text>
      <View style={styles.card}>
        <TouchableOpacity
          style={styles.linkRow}
          onPress={() => Linking.openURL('https://github.com/Wall333/Gate-automation')}
        >
          <Text style={styles.linkIcon}>📦</Text>
          <Text style={styles.linkText}>Source Code on GitHub</Text>
          <Text style={styles.chevron}>›</Text>
        </TouchableOpacity>
      </View>

      <Text style={styles.footer}>
        Made with ❤️ by Wall333
      </Text>
    </ScrollView>
  );
}

function InfoRow({ label, value, last }) {
  return (
    <View style={[styles.infoRow, !last && styles.infoRowBorder]}>
      <Text style={styles.infoLabel}>{label}</Text>
      <Text style={styles.infoValue}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f5f5f5',
  },
  content: {
    padding: 20,
    paddingBottom: 40,
  },
  header: {
    alignItems: 'center',
    marginBottom: 28,
    marginTop: 8,
  },
  logo: {
    width: 80,
    height: 80,
    borderRadius: 18,
    marginBottom: 12,
  },
  appName: {
    fontSize: 22,
    fontWeight: '700',
    color: '#1a1a1a',
  },
  version: {
    fontSize: 16,
    color: '#4285F4',
    fontWeight: '600',
    marginTop: 4,
  },
  build: {
    fontSize: 13,
    color: '#999',
    marginTop: 2,
  },
  sectionTitle: {
    fontSize: 13,
    fontWeight: '600',
    color: '#888',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginTop: 20,
    marginBottom: 8,
    marginLeft: 4,
  },
  card: {
    backgroundColor: '#fff',
    borderRadius: 12,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 3,
    elevation: 1,
  },
  infoRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 14,
    paddingHorizontal: 16,
  },
  infoRowBorder: {
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#eee',
  },
  infoLabel: {
    fontSize: 15,
    color: '#555',
  },
  infoValue: {
    fontSize: 15,
    color: '#1a1a1a',
    fontWeight: '500',
  },
  description: {
    fontSize: 14,
    color: '#555',
    lineHeight: 22,
    padding: 16,
  },
  linkRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 14,
    paddingHorizontal: 16,
  },
  linkIcon: {
    fontSize: 18,
    marginRight: 12,
  },
  linkText: {
    flex: 1,
    fontSize: 15,
    color: '#4285F4',
    fontWeight: '500',
  },
  chevron: {
    fontSize: 20,
    color: '#ccc',
    fontWeight: '300',
  },
  footer: {
    textAlign: 'center',
    color: '#bbb',
    fontSize: 13,
    marginTop: 32,
  },
});
