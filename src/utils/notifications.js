const { Expo } = require('expo-server-sdk');
const User = require('../models/User');

const expo = new Expo();

/**
 * Send push notification to a user
 * @param {string} userId - ID of the receiver
 * @param {object} notification - { title, body, data }
 */
exports.sendPushNotification = async (userId, { title, body, data }) => {
    try {
        const user = await User.findById(userId);
        if (!user || !user.fcmToken || !Expo.isExpoPushToken(user.fcmToken)) {
            console.log(`User ${userId} has no valid push token`);
            return;
        }

        const messages = [{
            to: user.fcmToken,
            sound: 'default',
            title,
            body,
            data: data || {},
        }];

        const chunks = expo.chunkPushNotifications(messages);
        const tickets = [];

        for (const chunk of chunks) {
            try {
                const ticketChunk = await expo.sendPushNotificationsAsync(chunk);
                tickets.push(...ticketChunk);
            } catch (error) {
                console.error('Error sending notification chunk:', error);
            }
        }

        return tickets;
    } catch (error) {
        console.error('Error in sendPushNotification:', error);
    }
};

/**
 * Send push notification to multiple users
 * @param {Array<string>} userIds - Array of receiver IDs
 * @param {object} notification - { title, body, data }
 */
exports.sendPushNotificationToMany = async (userIds, { title, body, data }) => {
    try {
        const users = await User.find({ _id: { $in: userIds }, fcmToken: { $exists: true } });
        const messages = [];

        for (const user of users) {
            if (Expo.isExpoPushToken(user.fcmToken)) {
                messages.push({
                    to: user.fcmToken,
                    sound: 'default',
                    title,
                    body,
                    data: data || {},
                });
            }
        }

        const chunks = expo.chunkPushNotifications(messages);
        for (const chunk of chunks) {
            try {
                await expo.sendPushNotificationsAsync(chunk);
            } catch (error) {
                console.error('Error sending notification chunk:', error);
            }
        }
    } catch (error) {
        console.error('Error in sendPushNotificationToMany:', error);
    }
};
