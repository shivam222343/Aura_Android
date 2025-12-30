const { Expo } = require('expo-server-sdk');
const User = require('../models/User');

const expo = new Expo();

/**
 * Send push notification to a specific user
 * @param {string} userId - ID of the user to notify
 * @param {object} notification - { title, body, data }
 */
exports.sendPushNotification = async (userId, notification) => {
    try {
        const title = notification.title;
        const body = notification.body || notification.message;
        const data = notification.data || {};

        const user = await User.findById(userId).select('fcmToken');

        if (!user || !user.fcmToken) {
            console.log(`Push: User ${userId} has no push token.`);
            return;
        }

        if (!Expo.isExpoPushToken(user.fcmToken)) {
            console.error(`Push token ${user.fcmToken} is not a valid Expo push token`);
            return;
        }

        const message = {
            to: user.fcmToken,
            sound: 'default',
            title: title,
            body: body,
            data: data,
            _displayInForeground: true,
        };

        const chunks = expo.chunkPushNotifications([message]);
        for (let chunk of chunks) {
            try {
                await expo.sendPushNotificationsAsync(chunk);
            } catch (error) {
                console.error('Error sending push notification chunk:', error);
            }
        }
    } catch (error) {
        console.error('Error in sendPushNotification:', error);
    }
};

/**
 * Send push notification to all members of a club
 * @param {string} clubId - ID of the club
 * @param {string} title - Title
 * @param {string} body - Body
 * @param {object} data - Data (includes senderId to avoid self-notifying)
 */
exports.sendClubPushNotification = async (clubId, title, body, data = {}) => {
    try {
        const query = { 'clubsJoined.clubId': clubId };
        if (data.senderId) {
            query._id = { $ne: data.senderId };
        }

        const users = await User.find(query).select('fcmToken');

        const messages = [];
        for (let user of users) {
            if (user.fcmToken && Expo.isExpoPushToken(user.fcmToken)) {
                messages.push({
                    to: user.fcmToken,
                    sound: 'default',
                    title: title,
                    body: body,
                    data: data,
                });
            }
        }

        if (messages.length === 0) return;

        const chunks = expo.chunkPushNotifications(messages);
        for (let chunk of chunks) {
            try {
                await expo.sendPushNotificationsAsync(chunk);
            } catch (error) {
                console.error('Error sending club push notification chunk:', error);
            }
        }
    } catch (error) {
        console.error('Error in sendClubPushNotification:', error);
    }
};

/**
 * Compatibility wrapper for sendPushNotificationToMany
 */
exports.sendPushNotificationToMany = async (userIds, notification) => {
    for (const userId of userIds) {
        await exports.sendPushNotification(userId, notification);
    }
};
