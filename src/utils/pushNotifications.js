const { sendPushNotification, sendBulkPushNotifications } = require('../services/pushNotification');
const User = require('../models/User');
const mongoose = require('mongoose');

/**
 * Get IO instance from req or app
 */
const getIO = (source) => {
    if (!source) return null;
    if (source.emit) return source; // already io
    if (source.app) return source.app.get('io'); // req
    if (source.get) return source.get('io'); // app
    return null;
};

/**
 * Send push notification to a specific user
 */
exports.sendPushNotification = async (userId, notification, socketSource = null) => {
    try {
        const title = notification.title;
        const body = notification.body || notification.message;
        const data = notification.data || {};

        // 1. Send via Socket (Real-time pop-up)
        const io = getIO(socketSource);
        if (io) {
            io.to(userId.toString()).emit('notification:receive', { title, message: body, data });
        }

        // 2. Send via Push
        const user = await User.findById(userId).select('fcmToken');
        if (user && user.fcmToken) {
            await sendPushNotification(user.fcmToken, { title, body, data });
        }
    } catch (error) {
        console.error('Error in sendPushNotification:', error);
    }
};

/**
 * Send push notification to all members of a club
 */
exports.sendClubPushNotification = async (clubId, title, body, data = {}, socketSource = null) => {
    try {
        const cid = typeof clubId === 'string' ? new mongoose.Types.ObjectId(clubId) : clubId;
        const query = { 'clubsJoined.clubId': cid };
        if (data.senderId) query._id = { $ne: data.senderId };

        const users = await User.find(query).select('fcmToken');

        // 1. Send via Socket
        const io = getIO(socketSource);
        if (io) {
            // Emitting to the whole club room
            // Client side logic should handle not showing if data.senderId === user._id
            io.to(`club:${clubId}`).emit('notification:receive', {
                title,
                message: body,
                data,
                senderId: data.senderId
            });
        }

        // 2. Send via Push
        const notifications = users
            .filter(u => u.fcmToken)
            .map(u => ({ pushToken: u.fcmToken, title, body, data }));

        if (notifications.length > 0) {
            await sendBulkPushNotifications(notifications);
        }
    } catch (error) {
        console.error('Error in sendClubPushNotification:', error);
    }
};

/**
 * Send push notification to multiple users efficiently
 */
exports.sendPushNotificationToMany = async (userIds, notification, socketSource = null) => {
    try {
        const title = notification.title;
        const body = notification.body || notification.message;
        const data = notification.data || {};

        // 1. Send via Socket
        const io = getIO(socketSource);
        if (io) {
            userIds.forEach(uid => {
                io.to(uid.toString()).emit('notification:receive', { title, message: body, data });
            });
        }

        // 2. Send via Push
        const users = await User.find({
            _id: { $in: userIds },
            fcmToken: { $exists: true }
        }).select('fcmToken');

        const notifications = users.map(u => ({ pushToken: u.fcmToken, title, body, data }));
        if (notifications.length > 0) {
            await sendBulkPushNotifications(notifications);
        }
    } catch (error) {
        console.error('Error in sendPushNotificationToMany:', error);
    }
};
