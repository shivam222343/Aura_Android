const { sendPushNotification, sendBulkPushNotifications } = require('../services/pushNotification');
const User = require('../models/User');
const mongoose = require('mongoose');

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

        // Native FCM tokens are long strings, no format check needed here
        // The service handles errors if token is invalid
        await sendPushNotification(user.fcmToken, {
            title,
            body,
            data
        });

    } catch (error) {
        console.error('Error in only sendPushNotification:', error);
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
        const cid = typeof clubId === 'string' ? new mongoose.Types.ObjectId(clubId) : clubId;
        const query = { 'clubsJoined.clubId': cid };
        if (data.senderId) {
            query._id = { $ne: data.senderId };
        }

        const users = await User.find(query).select('fcmToken');

        const notifications = [];
        for (let user of users) {
            if (user.fcmToken) {
                notifications.push({
                    pushToken: user.fcmToken,
                    title: title,
                    body: body,
                    data: data
                });
            }
        }

        if (notifications.length > 0) {
            await sendBulkPushNotifications(notifications);
        }
    } catch (error) {
        console.error('Error in sendClubPushNotification:', error);
    }
};

/**
 * Send push notification to multiple users efficiently
 * @param {string[]} userIds - Array of user IDs
 * @param {object} notification - { title, body, data }
 */
exports.sendPushNotificationToMany = async (userIds, notification) => {
    try {
        const title = notification.title;
        const body = notification.body || notification.message;
        const data = notification.data || {};

        const users = await User.find({
            _id: { $in: userIds },
            fcmToken: { $exists: true }
        }).select('fcmToken');

        const notifications = [];
        for (let user of users) {
            if (user.fcmToken) {
                notifications.push({
                    pushToken: user.fcmToken,
                    title: title,
                    body: body,
                    data: data
                });
            }
        }

        if (notifications.length > 0) {
            await sendBulkPushNotifications(notifications);
        }
    } catch (error) {
        console.error('Error in sendPushNotificationToMany:', error);
    }
};
