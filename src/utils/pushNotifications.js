const { Expo } = require('expo-server-sdk');
const User = require('../models/User');
const mongoose = require('mongoose');

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
        const categoryIdentifier = notification.categoryIdentifier;

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
            priority: 'high',
            channelId: 'default',
            categoryId: categoryIdentifier,
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
        const cid = typeof clubId === 'string' ? new mongoose.Types.ObjectId(clubId) : clubId;
        const query = { 'clubsJoined.clubId': cid };
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

        const messages = [];
        for (let user of users) {
            if (user.fcmToken && Expo.isExpoPushToken(user.fcmToken)) {
                messages.push({
                    to: user.fcmToken,
                    sound: 'default',
                    title: title,
                    body: body,
                    data: data,
                    priority: 'high',
                    channelId: 'default',
                });
            }
        }

        if (messages.length === 0) return;

        const chunks = expo.chunkPushNotifications(messages);
        for (let chunk of chunks) {
            try {
                await expo.sendPushNotificationsAsync(chunk);
            } catch (error) {
                console.error('Error sending batch push notification chunk:', error);
            }
        }
    } catch (error) {
        console.error('Error in sendPushNotificationToMany:', error);
    }
};
