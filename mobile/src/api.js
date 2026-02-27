import * as SecureStore from 'expo-secure-store';
import Config from './config';

const TOKEN_KEY = 'auth_jwt';
const USER_KEY = 'auth_user';

// ── Token storage ────────────────────────────────────────────────────

export async function getToken() {
  return await SecureStore.getItemAsync(TOKEN_KEY);
}

export async function setToken(token) {
  await SecureStore.setItemAsync(TOKEN_KEY, token);
}

export async function getUser() {
  const json = await SecureStore.getItemAsync(USER_KEY);
  return json ? JSON.parse(json) : null;
}

export async function setUser(user) {
  await SecureStore.setItemAsync(USER_KEY, JSON.stringify(user));
}

export async function clearAuth() {
  await SecureStore.deleteItemAsync(TOKEN_KEY);
  await SecureStore.deleteItemAsync(USER_KEY);
}

// ── Authenticated fetch wrapper ──────────────────────────────────────

async function authFetch(path, options = {}) {
  const token = await getToken();
  const headers = {
    'Content-Type': 'application/json',
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
    ...options.headers,
  };

  const res = await fetch(`${Config.SERVER_URL}${path}`, {
    ...options,
    headers,
  });

  // If unauthorized, clear stored auth
  if (res.status === 401) {
    await clearAuth();
  }

  return res;
}

// ── Auth API ─────────────────────────────────────────────────────────

export async function signInWithGoogle(idToken, code, redirectUri) {
  const body = {};
  if (idToken) body.idToken = idToken;
  if (code) body.code = code;
  if (redirectUri) body.redirectUri = redirectUri;

  const res = await fetch(`${Config.SERVER_URL}/auth/google`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

  const data = await res.json();

  if (!res.ok) {
    throw new Error(data.error || 'Sign-in failed');
  }

  if (data.approved && data.token) {
    await setToken(data.token);
    await setUser(data.user);
  }

  return data;
}

// ── Dev Login (development only) ─────────────────────────────────────

export async function devLogin(email, name) {
  const res = await fetch(`${Config.SERVER_URL}/auth/dev-login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, name }),
  });

  const data = await res.json();

  if (!res.ok) {
    throw new Error(data.error || 'Dev login failed');
  }

  if (data.approved && data.token) {
    await setToken(data.token);
    await setUser(data.user);
  }

  return data;
}

// ── Gate API ─────────────────────────────────────────────────────────

export async function getGateStatus() {
  const res = await authFetch('/gate/status');
  if (!res.ok) throw new Error('Failed to fetch device status');
  const data = await res.json();
  return data.devices;
}

export async function toggleGate(deviceId) {
  const res = await authFetch('/gate/toggle', {
    method: 'POST',
    body: JSON.stringify({ deviceId }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Toggle failed');
  return data;
}

// ── Admin API ────────────────────────────────────────────────────────

export async function getUsers(status) {
  const query = status ? `?status=${status}` : '';
  const res = await authFetch(`/admin/users${query}`);
  if (!res.ok) throw new Error('Failed to fetch users');
  return await res.json();
}

export async function approveUser(userId) {
  const res = await authFetch(`/admin/users/${userId}/approve`, {
    method: 'POST',
  });
  if (!res.ok) throw new Error('Failed to approve user');
  return await res.json();
}

export async function denyUser(userId) {
  const res = await authFetch(`/admin/users/${userId}/deny`, {
    method: 'POST',
  });
  if (!res.ok) throw new Error('Failed to deny user');
  return await res.json();
}

export async function getAuditLog() {
  const res = await authFetch('/admin/audit');
  if (!res.ok) throw new Error('Failed to fetch audit log');
  return await res.json();
}

// ── Device Management API ────────────────────────────────────────────

export async function registerDevice(name = 'Gate Controller') {
  const res = await authFetch('/admin/devices', {
    method: 'POST',
    body: JSON.stringify({ name }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Failed to register device');
  return data; // { id, name, token, message }
}

export async function deleteDevice(deviceId) {
  const res = await authFetch(`/admin/devices/${deviceId}`, {
    method: 'DELETE',
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Failed to delete device');
  return data;
}

export async function updateDevice(deviceId, updates) {
  const res = await authFetch(`/admin/devices/${deviceId}`, {
    method: 'PATCH',
    body: JSON.stringify(updates),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Failed to update device');
  return data;
}
