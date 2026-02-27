import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  Image,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { signInWithGoogle, devLogin } from '../api';
import { useAuth } from '../AuthContext';
import Config from '../config';

// Conditionally import native Google Sign-In (crashes in Expo Go)
let GoogleSignin = null;
let statusCodes = {};
try {
  const gsModule = require('@react-native-google-signin/google-signin');
  GoogleSignin = gsModule.GoogleSignin;
  statusCodes = gsModule.statusCodes;
  GoogleSignin.configure({
    webClientId: Config.GOOGLE_CLIENT_ID,
    offlineAccess: false,
  });
} catch (e) {
  // Native module not available (Expo Go) — Google button will be hidden
}

const isGoogleAvailable = GoogleSignin !== null;

export default function SignInScreen() {
  const { signIn } = useAuth();
  const [loading, setLoading] = useState(false);
  const [pendingMessage, setPendingMessage] = useState(null);

  async function handleGoogleSignIn() {
    setLoading(true);
    setPendingMessage(null);
    try {
      await GoogleSignin.hasPlayServices();
      // Sign out first to always show the account chooser
      try { await GoogleSignin.signOut(); } catch { /* ignore if not signed in */ }
      const userInfo = await GoogleSignin.signIn();
      const idToken = userInfo.data?.idToken || userInfo.idToken;

      if (!idToken) {
        throw new Error('No ID token received from Google');
      }

      const data = await signInWithGoogle(idToken);

      if (data.approved) {
        signIn(data.token, data.user);
      } else {
        setPendingMessage(
          data.message || 'Your account is pending admin approval.',
        );
      }
    } catch (err) {
      if (err.code === statusCodes.SIGN_IN_CANCELLED) {
        // User cancelled — do nothing
      } else if (err.code === statusCodes.IN_PROGRESS) {
        // Sign-in already in progress
      } else if (err.code === statusCodes.PLAY_SERVICES_NOT_AVAILABLE) {
        Alert.alert('Error', 'Google Play Services is not available');
      } else {
        Alert.alert('Sign-in Error', err.message);
      }
    } finally {
      setLoading(false);
    }
  }

  async function handleDevLogin() {
    setLoading(true);
    setPendingMessage(null);
    try {
      const data = await devLogin('welight243@gmail.com', 'Admin');

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
        <Image
          source={require('../../assets/icon.png')}
          style={styles.logo}
        />
        <Text style={styles.title}>Gate Controller</Text>
        <Text style={styles.subtitle}>Sign in to control your gate</Text>
      </View>

      {pendingMessage && (
        <View style={styles.pendingBox}>
          <Text style={styles.pendingIcon}>⏳</Text>
          <Text style={styles.pendingText}>{pendingMessage}</Text>
        </View>
      )}

      {/* Native Google Sign-In — works in production APK */}
      {isGoogleAvailable && (
        <TouchableOpacity
          style={[styles.googleButton, loading && styles.disabledButton]}
          onPress={handleGoogleSignIn}
          disabled={loading}
        >
          {loading ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <Text style={styles.googleText}>Sign in with Google</Text>
          )}
        </TouchableOpacity>
      )}

      {/* Dev login — for local testing (Expo Go) */}
      {(__DEV__ || !isGoogleAvailable) && (
        <>
          <TouchableOpacity
            style={[styles.devButton, loading && styles.disabledButton]}
            onPress={handleDevLogin}
            disabled={loading}
          >
            <Text style={styles.devText}>🔧 Dev Login</Text>
          </TouchableOpacity>

          <Text style={styles.devNote}>
            Dev mode only — hidden in production builds
          </Text>
        </>
      )}
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
  logo: {
    width: 100,
    height: 100,
    borderRadius: 20,
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
  googleButton: {
    backgroundColor: '#4285F4',
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
    marginBottom: 12,
  },
  googleText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#fff',
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
