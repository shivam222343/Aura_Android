const { sendPushNotification, sendMulticastPushNotification } = require('../services/firebaseService');
const User = require('../models/User');

/**
 * Send notification to a single user
 * @param {string} userId - User ID
 * @param {object} notification - Notification payload { title, body, image }
 * @param {object} data - Additional data payload
 */
const sendNotificationToUser = async (userId, notification, data = {}) => {
    try {
        const user = await User.findById(userId);

        if (!user || !user.fcmToken) {
            console.log(`⚠️ User ${userId} has no FCM token`);
            return { success: false, message: 'User has no FCM token' };
        }

        const result = await sendPushNotification(user.fcmToken, notification, data);
        return result;
    } catch (error) {
        console.error('Error sending notification to user:', error);
        return { success: false, error: error.message };
    }
};

/**
 * Send notification to multiple users
 * @param {string[]} userIds - Array of user IDs
 * @param {object} notification - Notification payload { title, body }
 * @param {object} data - Additional data payload
 */
const sendNotificationToUsers = async (userIds, notification, data = {}) => {
    try {
        const users = await User.find({ _id: { $in: userIds }, fcmToken: { $exists: true, $ne: null } });

        if (users.length === 0) {
            console.log('⚠️ No users with FCM tokens found');
            return { success: false, message: 'No users with FCM tokens' };
        }

        const fcmTokens = users.map(u => u.fcmToken);
        const result = await sendMulticastPushNotification(fcmTokens, notification, data);
        return result;
    } catch (error) {
        console.error('Error sending notifications to users:', error);
        return { success: false, error: error.message };
    }
};

/**
 * Send notification to all club members
 * @param {string} clubId - Club ID
 * @param {object} notification - Notification payload { title, body }
 * @param {object} data - Additional data payload
 * @param {string[]} excludeUserIds - User IDs to exclude (optional)
 */
const sendNotificationToClubMembers = async (clubId, notification, data = {}, excludeUserIds = []) => {
    try {
        const users = await User.find({
            'clubsJoined.clubId': clubId,
            fcmToken: { $exists: true, $ne: null },
            _id: { $nin: excludeUserIds }
        });

        if (users.length === 0) {
            console.log(`⚠️ No club members with FCM tokens found for club ${clubId}`);
            return { success: false, message: 'No club members with FCM tokens' };
        }

        const fcmTokens = users.map(u => u.fcmToken);
        const result = await sendMulticastPushNotification(fcmTokens, notification, data);
        return result;
    } catch (error) {
        console.error('Error sending notifications to club members:', error);
        return { success: false, error: error.message };
    }
};

/**
 * Send notification for new event
 * @param {object} event - Event object
 * @param {string} clubId - Club ID (optional, for club-specific events)
 */
const sendEventNotification = async (event, clubId = null) => {
    try {
        const notification = {
            title: '📅 New Event Created',
            body: `${event.title} - ${new Date(event.date).toLocaleDateString()}`,
        };

        const data = {
            type: 'event',
            eventId: event._id.toString(),
            screen: 'EventDetail',
        };

        if (clubId) {
            // Send to club members
            return await sendNotificationToClubMembers(clubId, notification, data);
        } else {
            // Send to all users (for global events)
            const users = await User.find({ fcmToken: { $exists: true, $ne: null } });
            const fcmTokens = users.map(u => u.fcmToken);
            return await sendMulticastPushNotification(fcmTokens, notification, data);
        }
    } catch (error) {
        console.error('Error sending event notification:', error);
        return { success: false, error: error.message };
    }
};

/**
 * Send notification for new task assignment
 * @param {object} task - Task object
 * @param {string} assignedUserId - Assigned user ID
 */
const sendTaskNotification = async (task, assignedUserId) => {
    try {
        const notification = {
            title: '✅ New Task Assigned',
            body: task.title,
        };

        const data = {
            type: 'task',
            taskId: task._id.toString(),
            screen: 'Tasks',
        };

        return await sendNotificationToUser(assignedUserId, notification, data);
    } catch (error) {
        console.error('Error sending task notification:', error);
        return { success: false, error: error.message };
    }
};

/**
 * Send notification for new meeting
 * @param {object} meeting - Meeting object
 * @param {string} clubId - Club ID
 */
const sendMeetingNotification = async (meeting, clubId) => {
    try {
        const notification = {
            title: '🎯 New Meeting Scheduled',
            body: `${meeting.title} - ${new Date(meeting.date).toLocaleDateString()}`,
        };

        const data = {
            type: 'meeting',
            meetingId: meeting._id.toString(),
            screen: 'Meetings',
        };

        return await sendNotificationToClubMembers(clubId, notification, data);
    } catch (error) {
        console.error('Error sending meeting notification:', error);
        return { success: false, error: error.message };
    }
};

/**
 * Send notification for new message
 * @param {object} message - Message object
 * @param {string} recipientId - Recipient user ID
 * @param {string} senderName - Sender display name
 */
const sendMessageNotification = async (message, recipientId, senderName) => {
    try {
        const notification = {
            title: `💬 New Message from ${senderName}`,
            body: message.content.substring(0, 100), // Truncate long messages
        };

        const data = {
            type: 'message',
            messageId: message._id.toString(),
            senderId: message.senderId.toString(),
            screen: 'Chat',
        };

        return await sendNotificationToUser(recipientId, notification, data);
    } catch (error) {
        console.error('Error sending message notification:', error);
        return { success: false, error: error.message };
    }
};

/**
 * Send notification for group chat message
 * @param {object} message - Message object
 * @param {string} clubId - Club ID
 * @param {string} clubName - Club name
 * @param {string} senderName - Sender display name
 * @param {string} senderId - Sender user ID (to exclude from notification)
 */
const sendGroupMessageNotification = async (message, clubId, clubName, senderName, senderId) => {
    try {
        const notification = {
            title: `${senderName} in ${clubName}`,
            body: message.content.substring(0, 100),
        };

        const data = {
            type: 'group_message',
            messageId: message._id.toString(),
            clubId: clubId.toString(),
            screen: 'GroupChat',
        };

        return await sendNotificationToClubMembers(clubId, notification, data, [senderId]);
    } catch (error) {
        console.error('Error sending group message notification:', error);
        return { success: false, error: error.message };
    }
};

/**
 * Send notification for club join request
 * @param {string} clubId - Club ID
 * @param {string} clubName - Club name
 * @param {string} userName - User name who requested to join
 */
const sendClubJoinRequestNotification = async (clubId, clubName, userName) => {
    try {
        // Send to club admins only
        const admins = await User.find({
            'clubsJoined': {
                $elemMatch: {
                    clubId: clubId,
                    role: 'admin'
                }
            },
            fcmToken: { $exists: true, $ne: null }
        });

        if (admins.length === 0) {
            console.log('⚠️ No club admins with FCM tokens found');
            return { success: false, message: 'No club admins with FCM tokens' };
        }

        const notification = {
            title: '👥 New Club Join Request',
            body: `${userName} wants to join ${clubName}`,
        };

        const data = {
            type: 'club_join_request',
            clubId: clubId.toString(),
            screen: 'ClubMembers',
        };

        const fcmTokens = admins.map(a => a.fcmToken);
        return await sendMulticastPushNotification(fcmTokens, notification, data);
    } catch (error) {
        console.error('Error sending club join request notification:', error);
        return { success: false, error: error.message };
    }
};

module.exports = {
    sendNotificationToUser,
    sendNotificationToUsers,
    sendNotificationToClubMembers,
    sendEventNotification,
    sendTaskNotification,
    sendMeetingNotification,
    sendMessageNotification,
    sendGroupMessageNotification,
    sendClubJoinRequestNotification,
};
