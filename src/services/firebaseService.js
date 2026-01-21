const admin = require('firebase-admin');

// Initialize Firebase Admin SDK
let firebaseInitialized = false;

try {
    // Try to initialize Firebase with environment variables (for production/Render)
    if (process.env.FIREBASE_PROJECT_ID && process.env.FIREBASE_PRIVATE_KEY && process.env.FIREBASE_CLIENT_EMAIL) {
        console.log('🔥 Initializing Firebase with environment variables...');

        admin.initializeApp({
            credential: admin.credential.cert({
                projectId: process.env.FIREBASE_PROJECT_ID,
                privateKey: process.env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, '\n'),
                clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
            }),
        });

        firebaseInitialized = true;
        console.log('✅ Firebase initialized successfully with environment variables');
    }
    // Try to use service account file (for local development)
    else {
        try {
            const serviceAccount = require('../../firebase-service-account.json');

            admin.initializeApp({
                credential: admin.credential.cert(serviceAccount),
            });

            firebaseInitialized = true;
            console.log('✅ Firebase initialized successfully with service account file');
        } catch (fileError) {
            console.warn('⚠️ Firebase service account file not found. Push notifications will be disabled.');
            console.warn('💡 To enable push notifications:');
            console.warn('   - For local: Place firebase-service-account.json in backend root');
            console.warn('   - For production: Set FIREBASE_PROJECT_ID, FIREBASE_PRIVATE_KEY, FIREBASE_CLIENT_EMAIL env vars');
        }
    }
} catch (error) {
    console.error('❌ Error initializing Firebase:', error.message);
    console.warn('⚠️ Push notifications will be disabled');
}

/**
 * Send push notification to a single device
 * @param {string} fcmToken - Device FCM token
 * @param {object} notification - Notification payload
 * @param {object} data - Additional data payload
 */
const sendPushNotification = async (fcmToken, notification, data = {}) => {
    if (!firebaseInitialized) {
        console.warn('⚠️ Firebase not initialized. Skipping push notification.');
        return { success: false, error: 'Firebase not initialized' };
    }
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
    if (!firebaseInitialized) {
        console.warn('⚠️ Firebase not initialized. Skipping multicast push notification.');
        return { success: false, error: 'Firebase not initialized' };
    }
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
    if (!firebaseInitialized) {
        console.warn('⚠️ Firebase not initialized. Skipping topic notification.');
        return { success: false, error: 'Firebase not initialized' };
    }
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
    if (!firebaseInitialized) {
        console.warn('⚠️ Firebase not initialized. Skipping topic subscription.');
        return { success: false, error: 'Firebase not initialized' };
    }
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
