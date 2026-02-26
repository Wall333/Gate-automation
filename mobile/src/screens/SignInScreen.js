import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { devLogin } from '../api';
import { useAuth } from '../AuthContext';
import Config from '../config';

export default function SignInScreen() {
  const { signIn } = useAuth();
  const [loading, setLoading] = useState(false);
  const [pendingMessage, setPendingMessage] = useState(null);

  async function handleDevLogin() {
    setLoading(true);
    setPendingMessage(null);
    try {
      const data = await devLogin('YOUR_EMAIL@gmail.com', 'Admin');

      if (data.approved) {
        signIn(data.token, data.user);
      } else {
        setPendingMessage(
          data.message || 'Your account is pending admin approval.',
        );
      }
    } catch (err) {
      Alert.alert('Sign-in Error', err.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.icon}>🔒</Text>
        <Text style={styles.title}>Gate Controller</Text>
        <Text style={styles.subtitle}>Sign in to control your gate</Text>
      </View>

      {pendingMessage && (
        <View style={styles.pendingBox}>
          <Text style={styles.pendingIcon}>⏳</Text>
          <Text style={styles.pendingText}>{pendingMessage}</Text>
        </View>
      )}

      {/* Dev login — only for local testing */}
      <TouchableOpacity
        style={[styles.devButton, loading && styles.disabledButton]}
        onPress={handleDevLogin}
        disabled={loading}
      >
        {loading ? (
          <ActivityIndicator color="#fff" />
        ) : (
          <Text style={styles.devText}>🔧 Dev Login (dev mode)</Text>
        )}
      </TouchableOpacity>

      <Text style={styles.devNote}>
        Dev mode — Google Sign-In will work in production builds
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f5f5f5',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  header: {
    alignItems: 'center',
    marginBottom: 48,
  },
  icon: {
    fontSize: 64,
    marginBottom: 16,
  },
  title: {
    fontSize: 28,
    fontWeight: '700',
    color: '#1a1a1a',
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 16,
    color: '#666',
  },
  pendingBox: {
    backgroundColor: '#FFF3CD',
    borderRadius: 12,
    padding: 16,
    marginBottom: 24,
    alignItems: 'center',
    width: '100%',
  },
  pendingIcon: {
    fontSize: 32,
    marginBottom: 8,
  },
  pendingText: {
    fontSize: 14,
    color: '#856404',
    textAlign: 'center',
  },
  devButton: {
    backgroundColor: '#FF9800',
    paddingVertical: 14,
    paddingHorizontal: 24,
    borderRadius: 8,
    alignItems: 'center',
    width: '100%',
    justifyContent: 'center',
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
  },
  disabledButton: {
    opacity: 0.6,
  },
  devText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#fff',
  },
  devNote: {
    marginTop: 16,
    fontSize: 12,
    color: '#999',
    textAlign: 'center',
  },
});
