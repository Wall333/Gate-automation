import React from 'react';
import { ActivityIndicator, View, Text, TouchableOpacity, Platform, StatusBar as RNStatusBar } from 'react-native';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';

import { AuthProvider, useAuth } from './src/AuthContext';
import SignInScreen from './src/screens/SignInScreen';
import DevicesScreen from './src/screens/DevicesScreen';
import DeviceDetailScreen from './src/screens/DeviceDetailScreen';
import AddDeviceScreen from './src/screens/AddDeviceScreen';
import UsersScreen from './src/screens/UsersScreen';

const Stack = createNativeStackNavigator();
const Tab = createBottomTabNavigator();

// ── Bottom tab navigator (main app) ─────────────────────────────────
function MainTabs() {
  const { isAdmin, signOut } = useAuth();

  return (
    <Tab.Navigator
      screenOptions={{
        tabBarActiveTintColor: '#4285F4',
        tabBarInactiveTintColor: '#888',
        tabBarStyle: { paddingBottom: Platform.OS === 'android' ? 8 : 4, height: Platform.OS === 'android' ? 64 : 56 },
        headerRight: () => (
          <View style={{ marginRight: 16 }}>
            <SignOutButton onPress={signOut} />
          </View>
        ),
      }}
    >
      <Tab.Screen
        name="Devices"
        component={DevicesStack}
        options={{
          headerShown: false,
          tabBarLabel: 'Devices',
          tabBarIcon: ({ color }) => <TabIcon label="📡" />,
        }}
      />
      {isAdmin && (
        <Tab.Screen
          name="Users"
          component={UsersScreen}
          options={{
            tabBarLabel: 'Users',
            tabBarIcon: ({ color }) => <TabIcon label="👥" />,
          }}
        />
      )}
    </Tab.Navigator>
  );
}

// ── Devices stack (list → detail, + add device) ──────────────────────
function DevicesStack() {
  const { signOut } = useAuth();

  return (
    <Stack.Navigator>
      <Stack.Screen
        name="DevicesList"
        component={DevicesScreen}
        options={{
          title: 'Devices',
          headerRight: () => (
            <SignOutButton onPress={signOut} />
          ),
        }}
      />
      <Stack.Screen
        name="DeviceDetail"
        component={DeviceDetailScreen}
        options={({ route }) => ({
          title: route.params?.device?.name || 'Device',
        })}
      />
      <Stack.Screen
        name="AddDevice"
        component={AddDeviceScreen}
        options={{ title: 'Add Device' }}
      />
    </Stack.Navigator>
  );
}

// ── Sign out button ──────────────────────────────────────────────────
function SignOutButton({ onPress }) {
  return (
    <TouchableOpacity onPress={onPress}>
      <Text style={{ color: '#FF3B30', fontSize: 14, fontWeight: '500' }}>
        Sign Out
      </Text>
    </TouchableOpacity>
  );
}

// Simple emoji tab icon
function TabIcon({ label }) {
  return (
    <View>
      <Text style={{ fontSize: 20 }}>{label}</Text>
    </View>
  );
}

// ── Root navigator (auth gate) ───────────────────────────────────────
function RootNavigator() {
  const { token, loading } = useAuth();

  if (loading) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
        <ActivityIndicator size="large" color="#4285F4" />
      </View>
    );
  }

  return (
    <NavigationContainer>
      {token ? <MainTabs /> : <AuthStack />}
    </NavigationContainer>
  );
}

function AuthStack() {
  return (
    <Stack.Navigator screenOptions={{ headerShown: false }}>
      <Stack.Screen name="SignIn" component={SignInScreen} />
    </Stack.Navigator>
  );
}

// ── App entry point ──────────────────────────────────────────────────
export default function App() {
  return (
    <SafeAreaProvider>
      <AuthProvider>
        <StatusBar style="dark" />
        {Platform.OS === 'android' && <View style={{ height: RNStatusBar.currentHeight }} />}
        <RootNavigator />
      </AuthProvider>
    </SafeAreaProvider>
  );
}
