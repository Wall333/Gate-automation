/**
 * Push notification service using Expo Push API.
 *
 * Sends push notifications to Expo push tokens via
 * https://exp.host/--/api/v2/push/send — no Firebase Admin SDK needed server-side
 */

const EXPO_PUSH_URL = 'https://exp.host/--/api/v2/push/send';

/**
 * Send a push notification to an Expo push token.
 * Returns:
 *   'ok'      — sent successfully
 *   'expired' — token is permanently invalid (DeviceNotRegistered), caller should remove it
 *   'error'   — temporary/config failure, caller should NOT remove the token
 */
async function sendPush(token, title, body, data = {}) {
  if (!token || !token.startsWith('ExponentPushToken[')) {
    console.log(`[notify] Invalid Expo push token: ${token?.slice(0, 20) ?? 'null'}`);
    return 'expired';
  }

  try {
    const res = await fetch(EXPO_PUSH_URL, {
      method: 'POST',
      headers: {
        'Accept': 'application/json',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        to: token,
        title,
        body,
        data,
        sound: 'default',
        channelId: 'gate-events',
        priority: 'high',
      }),
    });

    const json = await res.json();
    const ticket = json.data?.[0] ?? json.data ?? json;

    if (ticket.status === 'ok') {
      console.log(`[notify] Sent: "${title}" to token ...${token.slice(-8)}`);
      return 'ok';
    }

    // Token is no longer valid — caller should remove it
    if (ticket.details?.error === 'DeviceNotRegistered') {
      console.log(`[notify] Token expired ...${token.slice(-8)} — should be removed`);
      return 'expired';
    }

    // Any other error (FCM config, rate limit, etc.) — keep the token
    console.error(`[notify] Push error:`, ticket.message || ticket);
    return 'error';
  } catch (err) {
    console.error('[notify] Send error:', err.message);
    return 'error';
  }
}

module.exports = { sendPush };

