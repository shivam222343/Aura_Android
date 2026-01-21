const admin = require('firebase-admin');

// Initialize Firebase Admin SDK
// Download service account key from Firebase Console > Project Settings > Service Accounts
// Place the JSON file in a secure location (NOT in git)
const serviceAccount = require('../../firebase-service-account.json');

admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
});

/**
 * Send push notification to a single device
 * @param {string} fcmToken - Device FCM token
 * @param {object} notification - Notification payload
 * @param {object} data - Additional data payload
 */
const sendPushNotification = async (fcmToken, notification, data = {}) => {
    try {
        const message = {
            notification: {
                title: notification.title,
                body: notification.body,
                imageUrl: notification.image || undefined,
            },
            data: {
                ...data,
                clickAction: 'FLUTTER_NOTIFICATION_CLICK', // For handling clicks
            },
            token: fcmToken,
            android: {
                priority: 'high',
                notification: {
                    sound: 'default',
                    channelId: 'default',
                    color: '#0A66C2',
                },
            },
            apns: {
                payload: {
                    aps: {
                        sound: 'default',
                        badge: 1,
                    },
                },
            },
        };

        const response = await admin.messaging().send(message);
        console.log('✅ Push notification sent successfully:', response);
        return { success: true, messageId: response };
    } catch (error) {
        console.error('❌ Error sending push notification:', error);
        return { success: false, error: error.message };
    }
};

/**
 * Send push notification to multiple devices
 * @param {string[]} fcmTokens - Array of device FCM tokens
 * @param {object} notification - Notification payload
 * @param {object} data - Additional data payload
 */
const sendMulticastPushNotification = async (fcmTokens, notification, data = {}) => {
    try {
        const message = {
            notification: {
                title: notification.title,
                body: notification.body,
            },
            data: {
                ...data,
            },
            tokens: fcmTokens,
            android: {
                priority: 'high',
                notification: {
                    sound: 'default',
                    channelId: 'default',
                    color: '#0A66C2',
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

        const response = await admin.messaging().sendMulticast(message);
        console.log(`✅ Sent ${response.successCount} notifications successfully`);
        console.log(`❌ Failed ${response.failureCount} notifications`);

        return {
            success: true,
            successCount: response.successCount,
            failureCount: response.failureCount,
        };
    } catch (error) {
        console.error('❌ Error sending multicast push notification:', error);
        return { success: false, error: error.message };
    }
};

/**
 * Send notification to a topic (for broadcasting)
 * @param {string} topic - Topic name
 * @param {object} notification - Notification payload
 * @param {object} data - Additional data payload
 */
const sendTopicNotification = async (topic, notification, data = {}) => {
    try {
        const message = {
            notification: {
                title: notification.title,
                body: notification.body,
            },
            data: {
                ...data,
            },
            topic: topic,
            android: {
                priority: 'high',
            },
        };

        const response = await admin.messaging().send(message);
        console.log('✅ Topic notification sent successfully:', response);
        return { success: true, messageId: response };
    } catch (error) {
        console.error('❌ Error sending topic notification:', error);
        return { success: false, error: error.message };
    }
};

/**
 * Subscribe users to a topic
 * @param {string[]} fcmTokens - Array of FCM tokens
 * @param {string} topic - Topic name
 */
const subscribeToTopic = async (fcmTokens, topic) => {
    try {
        const response = await admin.messaging().subscribeToTopic(fcmTokens, topic);
        console.log(`✅ Subscribed ${response.successCount} devices to topic: ${topic}`);
        return { success: true, successCount: response.successCount };
    } catch (error) {
        console.error('❌ Error subscribing to topic:', error);
        return { success: false, error: error.message };
    }
};

module.exports = {
    sendPushNotification,
    sendMulticastPushNotification,
    sendTopicNotification,
    subscribeToTopic,
};
