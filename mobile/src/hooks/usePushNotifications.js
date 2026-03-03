import { useEffect, useRef } from 'react';
import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';
import { registerPushToken } from '../api';

// Configure notification channel for Android
Notifications.setNotificationChannelAsync('gate-events', {
  name: 'Gate Events',
  importance: Notifications.AndroidImportance.HIGH,
  vibrationPattern: [0, 250, 250, 250],
  lightColor: '#4285F4',
});

// Configure foreground notification behavior
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
    shouldShowBanner: true,
    shouldShowList: true,
  }),
});

/**
 * usePushNotifications — requests permission, gets the Expo push token,
 * and registers it with the server. Handles token refreshes.
 */
export default function usePushNotifications() {
  const tokenRef = useRef(null);

  useEffect(() => {
    (async () => {
      try {
        // Request permissions
        const { status: existingStatus } = await Notifications.getPermissionsAsync();
        let finalStatus = existingStatus;

        if (existingStatus !== 'granted') {
          const { status } = await Notifications.requestPermissionsAsync();
          finalStatus = status;
        }

        if (finalStatus !== 'granted') {
          console.log('[push] Permission not granted');
          return;
        }

        // Get Expo push token (uses FCM under the hood on Android)
        const tokenData = await Notifications.getExpoPushTokenAsync({
          projectId: 'b45dc574-abfc-4f3d-806d-16c977689f74',
        });
        const token = tokenData.data;

        if (token && token !== tokenRef.current) {
          tokenRef.current = token;
          await registerPushToken(token);
          console.log('[push] Token registered:', token.slice(0, 20) + '...');
        }
      } catch (err) {
        console.error('[push] Registration error:', err);
      }
    })();

    // Listen for token refreshes
    const subscription = Notifications.addPushTokenListener(async (newToken) => {
      try {
        const token = newToken.data;
        if (token && token !== tokenRef.current) {
          tokenRef.current = token;
          await registerPushToken(token);
          console.log('[push] Token refreshed and re-registered');
        }
      } catch (err) {
        console.error('[push] Token refresh error:', err);
      }
    });

    return () => subscription.remove();
  }, []);
}
