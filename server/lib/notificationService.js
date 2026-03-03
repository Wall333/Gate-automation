/**
 * Push notification service using Expo Push API.
 *
 * Sends push notifications to Expo push tokens via
 * https://exp.host/--/api/v2/push/send — no Firebase Admin SDK needed server-side
 */

const EXPO_PUSH_URL = 'https://exp.host/--/api/v2/push/send';

/**
 * Send a push notification to an Expo push token.
 * Returns true if sent, false if skipped or failed.
 */
async function sendPush(token, title, body, data = {}) {
  if (!token || !token.startsWith('ExponentPushToken[')) {
    console.log(`[notify] Invalid Expo push token: ${token?.slice(0, 20) ?? 'null'}`);
    return false;
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
      return true;
    }

    // Token is no longer valid
    if (ticket.details?.error === 'DeviceNotRegistered') {
      console.log(`[notify] Token expired ...${token.slice(-8)} — should be removed`);
      return false;
    }

    console.error(`[notify] Push error:`, ticket.message || ticket);
    return false;
  } catch (err) {
    console.error('[notify] Send error:', err.message);
    return false;
  }
}

module.exports = { sendPush };

