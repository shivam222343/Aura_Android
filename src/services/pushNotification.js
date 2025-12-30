const { Expo } = require('expo-server-sdk');

// Create a new Expo SDK client
const expo = new Expo();

/**
 * Send push notification to a single device
 * @param {string} pushToken - Expo push token
 * @param {object} options - Notification options
 * @param {string} options.title - Notification title
 * @param {string} options.body - Notification body
 * @param {object} options.data - Additional data
 * @returns {Promise} - Expo push ticket
 */
const sendPushNotification = async (pushToken, { title, body, data = {} }) => {
    // Check if the push token is valid
    if (!Expo.isExpoPushToken(pushToken)) {
        console.error(`❌ Invalid push token: ${pushToken}`);
        return null;
    }

    // Construct the notification message
    const message = {
        to: pushToken,
        sound: 'default',
        title,
        body,
        data,
        priority: 'high',
        badge: 1,
    };

    try {
        // Send the notification
        const tickets = await expo.sendPushNotificationsAsync([message]);

        // Check for errors
        if (tickets[0].status === 'error') {
            console.error('❌ Push notification error:', tickets[0].message);
            return null;
        }

        console.log('✅ Push notification sent successfully');
        return tickets[0];
    } catch (error) {
        console.error('❌ Failed to send push notification:', error);
        throw error;
    }
};

/**
 * Send push notifications to multiple devices
 * @param {Array} notifications - Array of {pushToken, title, body, data}
 * @returns {Promise} - Array of Expo push tickets
 */
const sendBulkPushNotifications = async (notifications) => {
    const messages = [];

    for (const notif of notifications) {
        if (Expo.isExpoPushToken(notif.pushToken)) {
            messages.push({
                to: notif.pushToken,
                sound: 'default',
                title: notif.title,
                body: notif.body,
                data: notif.data || {},
                priority: 'high',
                badge: 1,
            });
        }
    }

    // Expo recommends sending notifications in chunks of 100
    const chunks = expo.chunkPushNotifications(messages);
    const tickets = [];

    try {
        for (const chunk of chunks) {
            const ticketChunk = await expo.sendPushNotificationsAsync(chunk);
            tickets.push(...ticketChunk);
        }

        console.log(`✅ Sent ${tickets.length} push notifications`);
        return tickets;
    } catch (error) {
        console.error('❌ Failed to send bulk push notifications:', error);
        throw error;
    }
};

/**
 * Handle push notification receipts
 * @param {Array} tickets - Array of Expo push tickets
 */
const handlePushReceipts = async (tickets) => {
    const receiptIds = tickets
        .filter(ticket => ticket.id)
        .map(ticket => ticket.id);

    if (receiptIds.length === 0) {
        return;
    }

    try {
        const receiptIdChunks = expo.chunkPushNotificationReceiptIds(receiptIds);

        for (const chunk of receiptIdChunks) {
            const receipts = await expo.getPushNotificationReceiptsAsync(chunk);

            for (const receiptId in receipts) {
                const receipt = receipts[receiptId];

                if (receipt.status === 'error') {
                    console.error(`❌ Receipt error for ${receiptId}:`, receipt.message);

                    // Handle specific errors
                    if (receipt.details && receipt.details.error) {
                        // The error codes are listed here: 
                        // https://docs.expo.dev/push-notifications/sending-notifications/#individual-errors
                        console.error(`Error code: ${receipt.details.error}`);
                    }
                }
            }
        }
    } catch (error) {
        console.error('❌ Failed to handle push receipts:', error);
    }
};

module.exports = {
    sendPushNotification,
    sendBulkPushNotifications,
    handlePushReceipts
};
