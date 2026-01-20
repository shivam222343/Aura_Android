const admin = require('firebase-admin');
const { Expo } = require('expo-server-sdk');
const path = require('path');
const fs = require('fs');

// Initialize Expo SDK
const expo = new Expo();

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
        console.warn('⚠️ No Firebase credentials found (ENV or File). Notifications will fail for direct FCM.');
    }
} catch (error) {
    console.error('⚠️ Failed to initialize Firebase Admin:', error.message);
}

/**
 * Send push notification to a single device (Supports FCM & Expo)
 * @param {string} pushToken - FCM or Expo registration token
 * @param {object} options - Notification options
 */
const sendPushNotification = async (pushToken, { title, body, data = {} }) => {
    if (!pushToken) {
        console.error('❌ Missing push token');
        return null;
    }

    // --- DETECT EXPO PUSH TOKEN ---
    if (pushToken.startsWith('ExponentPushToken') || pushToken.startsWith('ExpoPushToken')) {
        if (!Expo.isExpoPushToken(pushToken)) {
            console.error(`❌ Push token ${pushToken} is not a valid Expo push token`);
            return null;
        }

        try {
            console.log('📡 Sending via Expo Push Service...');
            const messages = [{
                to: pushToken,
                sound: 'default',
                title: title,
                body: body,
                data: {
                    ...data,
                    title,
                    body,
                    message: body
                },
                priority: 'high',
                channelId: 'default',
            }];

            const chunks = expo.chunkPushNotifications(messages);
            for (let chunk of chunks) {
                const ticketChunk = await expo.sendPushNotificationsAsync(chunk);
                console.log('✅ Expo Notification Receipt:', ticketChunk);
                return ticketChunk;
            }
        } catch (error) {
            console.error('❌ Failed to send via Expo:', error);
            return null;
        }
    }

    // --- FALLBACK TO FIREBASE (FCM) ---
    if (!admin.apps.length) {
        console.error('❌ Firebase Admin not initialized');
        return null;
    }

    try {
        const message = {
            notification: {
                title: title,
                body: body,
            },
            data: {
                ...Object.keys(data).reduce((acc, key) => {
                    const value = data[key];
                    if (value && (typeof value === 'object' || Array.isArray(value))) {
                        acc[key] = JSON.stringify(value);
                    } else {
                        acc[key] = String(value);
                    }
                    return acc;
                }, {}),
                title: String(title),
                body: String(body),
                message: String(body),
            },
            token: pushToken,
            android: {
                priority: 'high',
                notification: {
                    sound: 'default',
                    channelId: 'default',
                    clickAction: data.category || 'default'
                },
            },
            apns: {
                payload: {
                    aps: {
                        sound: 'default',
                        badge: 1,
                        category: data.category || 'default',
                        'content-available': 1
                    },
                },
            },
        };

        const response = await admin.messaging().send(message);
        console.log('✅ FCM Push notification sent:', response);
        return response;
    } catch (error) {
        console.error('❌ Failed to send push notification (FCM):', error);
        return null;
    }
};

/**
 * Send push notifications to multiple devices
 */
const sendBulkPushNotifications = async (notifications) => {
    // Separate Expo and FCM notifications for efficiency
    const expoNotifications = [];
    const fcmNotifications = [];

    notifications.forEach(n => {
        if (n.pushToken && (n.pushToken.startsWith('ExponentPushToken') || n.pushToken.startsWith('ExpoPushToken'))) {
            expoNotifications.push(n);
        } else if (n.pushToken) {
            fcmNotifications.push(n);
        }
    });

    const responses = [];

    // Handle Expo Bulk
    if (expoNotifications.length > 0) {
        const messages = expoNotifications.map(n => ({
            to: n.pushToken,
            sound: 'default',
            title: n.title,
            body: n.body,
            data: { ...n.data, title: n.title, body: n.body },
            priority: 'high'
        }));
        const chunks = expo.chunkPushNotifications(messages);
        for (let chunk of chunks) {
            try {
                const ticketChunk = await expo.sendPushNotificationsAsync(chunk);
                responses.push(...ticketChunk);
            } catch (e) {
                console.error('Bulk Expo Error:', e);
            }
        }
    }

    // Handle FCM Bulk
    for (const notif of fcmNotifications) {
        const res = await sendPushNotification(notif.pushToken, {
            title: notif.title,
            body: notif.body,
            data: notif.data
        });
        responses.push(res);
    }

    return responses;
};

const handlePushReceipts = async (tickets) => {
    // Optional: implement Expo receipt checking if needed
    return;
};

module.exports = {
    sendPushNotification,
    sendBulkPushNotifications,
    handlePushReceipts
};
