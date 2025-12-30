const { Expo } = require('expo-server-sdk');
const User = require('../models/User');

// Create a new Expo SDK client
const expo = new Expo();

/**
 * Send push notification to a specific user
 * @param {string} userId - ID of the user to notify
 * @param {string} title - Title of the notification
 * @param {string} body - Body of the notification
 * @param {object} data - Additional data to send
 */
exports.sendPushNotification = async (userId, title, body, data = {}) => {
    try {
        const user = await User.findById(userId).select('fcmToken');

        if (!user || !user.fcmToken) {
            console.log(`Push: User ${userId} has no push token.`);
            return;
        }

        // Check that all your push tokens appear to be valid Expo push tokens
        if (!Expo.isExpoPushToken(user.fcmToken)) {
            console.error(`Push token ${user.fcmToken} is not a valid Expo push token`);
            return;
        }

        // Create the messages that you want to send to clients
        const message = {
            to: user.fcmToken,
            sound: 'default',
            title: title,
            body: body,
            data: data,
            _displayInForeground: true, // Show even if app is open
        };

        const chunks = expo.chunkPushNotifications([message]);
        const tickets = [];

        for (let chunk of chunks) {
            try {
                let ticketChunk = await expo.sendPushNotificationsAsync(chunk);
                tickets.push(...ticketChunk);
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
 * @param {object} data - Data
 */
exports.sendClubPushNotification = async (clubId, title, body, data = {}) => {
    try {
        // Find users who have this clubId in their clubsJoined
        const users = await User.find({
            'clubsJoined.clubId': clubId
        }).select('fcmToken');

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
