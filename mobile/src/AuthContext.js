import React, { createContext, useContext, useState, useEffect } from 'react';
import { getToken, getUser, clearAuth } from './api';

// Conditionally import Google Sign-In for signOut
let GoogleSignin = null;
try {
  const gsModule = require('@react-native-google-signin/google-signin');
  GoogleSignin = gsModule.GoogleSignin;
} catch {
  // Not available
}

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [token, setToken] = useState(null);
  const [loading, setLoading] = useState(true);

  // Load stored auth on mount
  useEffect(() => {
    (async () => {
      try {
        const storedToken = await getToken();
        const storedUser = await getUser();
        if (storedToken && storedUser) {
          setToken(storedToken);
          setUser(storedUser);
        }
      } catch (e) {
        console.warn('Failed to load auth:', e);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const signIn = (newToken, newUser) => {
    setToken(newToken);
    setUser(newUser);
  };

  const signOut = async () => {
    // Sign out of Google so account chooser shows next time
    if (GoogleSignin) {
      try { await GoogleSignin.signOut(); } catch { /* ignore */ }
    }
    await clearAuth();
    setToken(null);
    setUser(null);
  };

  const isAdmin = user?.role === 'admin';

  return (
    <AuthContext.Provider value={{ user, token, loading, isAdmin, signIn, signOut }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be inside AuthProvider');
  return ctx;
}
