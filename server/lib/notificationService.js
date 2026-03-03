/**
 * Push notification service using Firebase Cloud Messaging via firebase-admin.
 *
 * If Firebase is not configured (no service account), notifications are
 * logged to console but not sent. This allows the server to run without
 * Firebase during development.
 */

let admin = null;
let messaging = null;

function initFirebase() {
  try {
    const firebaseAdmin = require('firebase-admin');

    const serviceAccountPath = process.env.FIREBASE_SERVICE_ACCOUNT;
    if (!serviceAccountPath) {
      console.log('[notify] FIREBASE_SERVICE_ACCOUNT not set — push notifications disabled');
      return;
    }

    let credential;
    // Support both a file path and an inline JSON string
    if (serviceAccountPath.startsWith('{')) {
      const serviceAccount = JSON.parse(serviceAccountPath);
      credential = firebaseAdmin.credential.cert(serviceAccount);
    } else {
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const serviceAccount = require(serviceAccountPath);
      credential = firebaseAdmin.credential.cert(serviceAccount);
    }

    firebaseAdmin.initializeApp({ credential });
    admin = firebaseAdmin;
    messaging = firebaseAdmin.messaging();
    console.log('[notify] Firebase initialized — push notifications enabled');
  } catch (err) {
    console.error('[notify] Firebase init failed:', err.message);
    console.log('[notify] Push notifications disabled');
  }
}

/**
 * Send a push notification to a specific FCM/Expo token.
 * Returns true if sent, false if skipped or failed.
 */
async function sendPush(token, title, body, data = {}) {
  if (!messaging) {
    console.log(`[notify] (no FCM) Would send: "${title}" — "${body}"`);
    return false;
  }

  try {
    await messaging.send({
      token,
      notification: { title, body },
      data,
      android: {
        priority: 'high',
        notification: {
          channelId: 'gate-events',
        },
      },
    });
    console.log(`[notify] Sent: "${title}" to token ...${token.slice(-6)}`);
    return true;
  } catch (err) {
    // Token is no longer valid — caller should clean it up
    if (
      err.code === 'messaging/registration-token-not-registered' ||
      err.code === 'messaging/invalid-registration-token'
    ) {
      console.log(`[notify] Invalid token ...${token.slice(-6)} — should be removed`);
      return false;
    }
    console.error('[notify] Send error:', err.message);
    return false;
  }
}

/**
 * Check if push notifications are available (Firebase configured).
 */
function isPushAvailable() {
  return messaging !== null;
}

module.exports = { initFirebase, sendPush, isPushAvailable };
