const admin = require('firebase-admin');
const path = require('path');
const fs = require('fs');

// Initialize Firebase Admin
try {
    let serviceAccount;

    // 1. Try Environment Variable (Best for deployment)
    if (process.env.FIREBASE_SERVICE_ACCOUNT) {
        try {
            serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
            console.log('🔥 Using Firebase Config from Environment Variable');
        } catch (e) {
            console.error('❌ Failed to parse FIREBASE_SERVICE_ACCOUNT env var');
        }
    }

    // 2. Try Local File (Best for local dev)
    if (!serviceAccount) {
        const serviceAccountPath = path.join(__dirname, '../../serviceAccountKey.json');
        if (fs.existsSync(serviceAccountPath)) {
            serviceAccount = require(serviceAccountPath);
            console.log('🔥 Using Firebase Config from serviceAccountKey.json');
        }
    }

    if (serviceAccount) {
        if (!admin.apps.length) {
            admin.initializeApp({
                credential: admin.credential.cert(serviceAccount)
            });
            console.log('🔥 Firebase Admin Initialized');
        }
    } else {
        console.warn('⚠️ No Firebase credentials found (ENV or File). Notifications will fail.');
    }
} catch (error) {
    console.error('⚠️ Failed to initialize Firebase Admin:', error.message);
}

/**
 * Send push notification to a single device
 * @param {string} pushToken - FCM registration token
 * @param {object} options - Notification options
 * @param {string} options.title - Notification title
 * @param {string} options.body - Notification body
 * @param {object} options.data - Additional data
 * @returns {Promise} - Firebase messaging response
 */
const sendPushNotification = async (pushToken, { title, body, data = {} }) => {
    if (!admin.apps.length) {
        console.error('❌ Firebase Admin not initialized');
        return null;
    }

    if (!pushToken) {
        console.error('❌ Missing push token');
        return null;
    }

    try {
        const message = {
            notification: {
                title: title,
                body: body,
            },
            data: data, // data must be map of strings
            token: pushToken,
            android: {
                priority: 'high',
                notification: {
                    sound: 'default',
                    channelId: 'default',
                    clickAction: 'FLUTTER_NOTIFICATION_CLICK', // Standard for many cross-platform setups, but 'default' works for RN too usually.
                },
            },
            apns: {
                payload: {
                    aps: {
                        sound: 'default',
                    },
                },
            },
        };

        const response = await admin.messaging().send(message);
        console.log('✅ Push notification sent:', response);
        return response;
    } catch (error) {
        console.error('❌ Failed to send push notification:', error);
        return null; // Return null so caller doesn't crash
    }
};

/**
 * Send push notifications to multiple devices
 * @param {Array} notifications - Array of {pushToken, title, body, data}
 * @returns {Promise} - Array of responses
 */
const sendBulkPushNotifications = async (notifications) => {
    if (!admin.apps.length) return [];

    const responses = [];
    for (const notif of notifications) {
        if (notif.pushToken) {
            const res = await sendPushNotification(notif.pushToken, {
                title: notif.title,
                body: notif.body,
                data: notif.data
            });
            responses.push(res);
        }
    }
    return responses;
};

/**
 * Handle push notification receipts
 * NOTE: FCM doesn't have an async receipt fetching mechanism like Expo.
 * Delivery is confirmed in the send response or via FCM data export.
 * This function is kept for compatibility but does nothing.
 */
const handlePushReceipts = async (tickets) => {
    // Not applicable for FCM direct sending
    return;
};

module.exports = {
    sendPushNotification,
    sendBulkPushNotifications,
    handlePushReceipts
};
