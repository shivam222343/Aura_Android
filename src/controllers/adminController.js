const User = require('../models/User');
const Club = require('../models/Club');
const Meeting = require('../models/Meeting');
const Game = require('../models/Game');

/**
 * @desc    Get system stats
 * @route   GET /api/admin/stats
 * @access  Admin
 */
exports.getStats = async (req, res) => {
    try {
        const totalUsers = await User.countDocuments();
        const totalClubs = await Club.countDocuments();
        const totalMeetings = await Meeting.countDocuments();
        const onlineUsers = await User.countDocuments({ isOnline: true });

        // Get recent registrations (last 30 days)
        const thirtyDaysAgo = new Date();
        thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

        const newUsers = await User.countDocuments({
            createdAt: { $gte: thirtyDaysAgo }
        });

        res.status(200).json({
            success: true,
            data: {
                totalUsers,
                totalClubs,
                totalMeetings,
                onlineUsers,
                newUsers
            }
        });
    } catch (error) {
        console.error('Get stats error:', error);
        res.status(500).json({
            success: false,
            message: 'Error fetching stats'
        });
    }
};

/**
 * @desc    Get all users
 * @route   GET /api/admin/users
 * @access  Admin
 */
exports.getAllUsers = async (req, res) => {
    try {
        const users = await User.find()
            .select('-password')
            .sort('-createdAt');

        res.status(200).json({
            success: true,
            count: users.length,
            data: users
        });
    } catch (error) {
        console.error('Get users error:', error);
        res.status(500).json({
            success: false,
            message: 'Error fetching users'
        });
    }
};

/**
 * @desc    Change user role
 * @route   PUT /api/admin/users/:id/role
 * @access  Admin
 */
exports.changeUserRole = async (req, res) => {
    try {
        const { role } = req.body;
        const ValidRoles = ['member', 'alumni', 'admin', 'user'];

        if (!ValidRoles.includes(role)) {
            return res.status(400).json({
                success: false,
                message: 'Invalid role'
            });
        }

        const user = await User.findByIdAndUpdate(
            req.params.id,
            { role },
            { new: true, runValidators: true }
        ).select('-password');

        if (!user) {
            return res.status(404).json({
                success: false,
                message: 'User not found'
            });
        }

        res.status(200).json({
            success: true,
            message: `User role updated to ${role}`,
            data: user
        });
    } catch (error) {
        console.error('Change role error:', error);
        res.status(500).json({
            success: false,
            message: 'Error updating user role'
        });
    }
};
const Notification = require('../models/Notification');
const { sendPushNotificationToMany, sendClubPushNotification } = require('../utils/pushNotifications');

/**
 * @desc    Send custom notification to users or clubs
 * @route   POST /api/admin/send-notification
 * @access  Admin
 */
const mongoose = require('mongoose');

exports.sendCustomNotification = async (req, res) => {
    try {
        const { title, message, clubId, priority } = req.body;

        if (!title || !message) {
            return res.status(400).json({ success: false, message: 'Title and message are required' });
        }

        let targetUsers = [];
        const notificationData = {
            type: 'admin_custom_notification',
            title,
            message,
            priority: priority || 'high',
            data: { custom: true }
        };

        if (clubId && clubId !== 'all') {
            // Club specific
            const cid = new mongoose.Types.ObjectId(clubId);
            const users = await User.find({
                'clubsJoined.clubId': cid
            }).select('_id fcmToken');

            targetUsers = users.map(u => u._id);
            notificationData.clubId = clubId;

            // Only send push to those with tokens
            const usersWithTokens = users.filter(u => u.fcmToken).map(u => u._id);
            if (usersWithTokens.length > 0) {
                await sendPushNotificationToMany(usersWithTokens, {
                    title,
                    body: message,
                    data: { type: 'admin_custom', clubId }
                });
            }
        } else {
            // All users
            const users = await User.find().select('_id');
            targetUsers = users.map(u => u._id);

            // Send Push to all (chunked)
            const allUsersWithToken = await User.find({ fcmToken: { $exists: true } }).select('_id');
            const allIds = allUsersWithToken.map(u => u._id);
            await sendPushNotificationToMany(allIds, { title, body: message, data: { type: 'admin_custom' } });
        }

        // Save in-app notifications for all target users
        const notifications = targetUsers.map(userId => ({
            ...notificationData,
            userId
        }));

        await Notification.insertMany(notifications);

        res.status(200).json({
            success: true,
            message: `Notification sent to ${targetUsers.length} users`
        });
    } catch (error) {
        console.error('Send custom notification error:', error);
        res.status(500).json({
            success: false,
            message: 'Error sending notification'
        });
    }
};
/**
 * @desc    Get all games configuration
 * @route   GET /api/admin/games
 * @access  Private
 */
exports.getGames = async (req, res) => {
    try {
        const games = await Game.find();
        res.status(200).json({ success: true, data: games });
    } catch (error) {
        res.status(500).json({ success: false, message: 'Error fetching games' });
    }
};

/**
 * @desc    Update or create game config (poster)
 * @route   POST /api/admin/games
 * @access  Admin
 */
exports.updateGameConfig = async (req, res) => {
    try {
        const { gameId, name, posterUrl, description, players, tag, color } = req.body;

        let game = await Game.findOne({ gameId });
        if (game) {
            game.posterUrl = posterUrl || game.posterUrl;
            game.name = name || game.name;
            game.description = description || game.description;
            game.players = players || game.players;
            game.tag = tag || game.tag;
            game.color = color || game.color;
            await game.save();
        } else {
            game = await Game.create({
                gameId, name, posterUrl, description, players, tag, color
            });
        }

        res.status(200).json({ success: true, data: game });
    } catch (error) {
        res.status(500).json({ success: false, message: 'Error updating game config' });
    }
};
