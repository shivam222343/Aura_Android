const Message = require('../models/Message');
const User = require('../models/User');
const { sendPushNotification } = require('../utils/notifications');

/**
 * @desc    Get messages for a conversation
 * @route   GET /api/messages/:userId
 * @access  Private
 */
exports.getMessages = async (req, res) => {
    try {
        const otherUserId = req.params.userId;
        const currentUserId = req.user._id;

        const messages = await Message.find({
            $or: [
                { senderId: currentUserId, receiverId: otherUserId },
                { senderId: otherUserId, receiverId: currentUserId }
            ],
            deletedFor: { $ne: currentUserId }
        })
            .sort({ createdAt: 1 })
            .populate('senderId', 'displayName profilePicture')
            .populate('receiverId', 'displayName profilePicture')
            .populate('replyTo');

        res.status(200).json({
            success: true,
            data: messages
        });
    } catch (error) {
        console.error('Error fetching messages:', error);
        res.status(500).json({
            success: false,
            message: 'Error fetching messages'
        });
    }
};

/**
 * @desc    Send a message
 * @route   POST /api/messages
 * @access  Private
 */
exports.sendMessage = async (req, res) => {
    try {
        const { receiverId, content, type, fileUrl, clubId, replyTo, mentionAI } = req.body;
        const senderId = req.user._id;

        const newMessage = await Message.create({
            senderId,
            receiverId,
            content,
            type,
            fileUrl,
            clubId,
            replyTo,
            mentionAI: mentionAI || false
        });

        // Populate sender info for the real-time update
        const populatedMessage = await Message.findById(newMessage._id)
            .populate('senderId', 'displayName profilePicture')
            .populate('receiverId', 'displayName profilePicture')
            .populate('replyTo');

        // Socket.io event
        const io = req.app.get('io');
        if (io) {
            io.to(receiverId.toString()).emit('message:receive', populatedMessage);
        }

        res.status(201).json({
            success: true,
            data: populatedMessage
        });

        // Send Push Notification
        sendPushNotification(receiverId, {
            title: populatedMessage.senderId.displayName,
            body: type === 'text' ? content : 'Sent an attachment',
            data: {
                screen: 'Chat',
                params: { otherUser: { _id: senderId, displayName: populatedMessage.senderId.displayName } }
            }
        });

        // Handle AI mention asynchronously
        if (mentionAI && content.includes('@Eta')) {
            const aiController = require('./aiController');

            // Get conversation history
            const conversationMessages = await Message.find({
                $or: [
                    { senderId: senderId, receiverId: receiverId },
                    { senderId: receiverId, receiverId: senderId }
                ],
                deletedFor: { $ne: senderId }
            })
                .sort({ createdAt: 1 })
                .limit(20);

            // Get AI response
            const aiMessage = await aiController.handleAIMention(
                senderId,
                receiverId,
                conversationMessages,
                populatedMessage
            );

            if (aiMessage && io) {
                // Send AI response to both users
                const aiResponse = {
                    ...aiMessage.toObject(),
                    senderId: {
                        _id: 'AI',
                        displayName: 'Eta (AI Assistant)',
                        profilePicture: null
                    }
                };

                io.to(senderId.toString()).emit('message:receive', aiResponse);
                io.to(receiverId.toString()).emit('message:receive', aiResponse);
            }
        }
    } catch (error) {
        console.error('Error sending message:', error);
        res.status(500).json({
            success: false,
            message: 'Error sending message'
        });
    }
};

/**
 * @desc    Mark messages as read
 * @route   PUT /api/messages/:userId/read
 * @access  Private
 */
exports.markAsRead = async (req, res) => {
    try {
        const otherUserId = req.params.userId;
        const currentUserId = req.user._id;

        await Message.updateMany(
            { senderId: otherUserId, receiverId: currentUserId, read: false },
            { $set: { read: true, readAt: new Date() } }
        );

        res.status(200).json({
            success: true,
            message: 'Messages marked as read'
        });
    } catch (error) {
        console.error('Error marking as read:', error);
        res.status(500).json({
            success: false,
            message: 'Error marking messages as read'
        });
    }
};

/**
 * @desc    Add/Update reaction to a message
 * @route   POST /api/messages/:messageId/reaction
 * @access  Private
 */
exports.addReaction = async (req, res) => {
    try {
        const { emoji } = req.body;
        const messageId = req.params.messageId;
        const userId = req.user._id;

        const message = await Message.findById(messageId);
        if (!message) {
            return res.status(404).json({ success: false, message: 'Message not found' });
        }

        const existingReactionIndex = message.reactions.findIndex(r => r.userId.toString() === userId.toString());

        if (existingReactionIndex > -1) {
            if (message.reactions[existingReactionIndex].emoji === emoji) {
                // Remove if same
                message.reactions.splice(existingReactionIndex, 1);
            } else {
                // Update if different
                message.reactions[existingReactionIndex].emoji = emoji;
            }
        } else {
            message.reactions.push({ userId, emoji });
        }

        await message.save();

        const io = req.app.get('io');
        if (io) {
            const room = [message.senderId.toString(), message.receiverId.toString()];
            room.forEach(r => io.to(r).emit('message:reaction', { messageId, reactions: message.reactions }));
        }

        res.status(200).json({
            success: true,
            data: message.reactions
        });
    } catch (error) {
        console.error('Error adding reaction:', error);
        res.status(500).json({
            success: false,
            message: 'Error adding reaction'
        });
    }
};

/**
 * @desc    Delete message
 * @route   DELETE /api/messages/:messageId
 * @access  Private
 */
exports.deleteMessage = async (req, res) => {
    try {
        const { type } = req.query; // 'me' or 'everyone'
        const messageId = req.params.messageId;
        const userId = req.user._id;

        const message = await Message.findById(messageId);
        if (!message) {
            return res.status(404).json({ success: false, message: 'Message not found' });
        }

        if (type === 'everyone') {
            // Handle both populated and non-populated senderId
            const senderIdStr = message.senderId._id ? message.senderId._id.toString() : message.senderId.toString();
            if (senderIdStr !== userId.toString()) {
                return res.status(403).json({ success: false, message: 'Unauthorized' });
            }
            message.deleted = true;
            message.deletedAt = new Date();
            message.content = 'This message was deleted';
        } else {
            // Delete for me
            if (!message.deletedFor.includes(userId)) {
                message.deletedFor.push(userId);
            }
        }

        await message.save();

        const io = req.app.get('io');
        if (io && type === 'everyone') {
            const room = [message.senderId.toString(), message.receiverId.toString()];
            room.forEach(r => io.to(r).emit('message:delete', { messageId, type: 'everyone' }));
        }

        res.status(200).json({
            success: true,
            message: 'Message deleted'
        });
    } catch (error) {
        console.error('Error deleting message:', error);
        res.status(500).json({
            success: false,
            message: 'Error deleting message'
        });
    }
};

/**
 * @desc    Get all conversations for current user
 * @route   GET /api/messages/conversations/list
 * @access  Private
 */
exports.getConversations = async (req, res) => {
    try {
        const userId = req.user._id;

        // Find all messages involving the user
        const messages = await Message.find({
            $or: [{ senderId: userId }, { receiverId: userId }],
            deletedFor: { $ne: userId }
        })
            .sort({ createdAt: -1 })
            .populate('senderId', 'displayName profilePicture isOnline lastSeen')
            .populate('receiverId', 'displayName profilePicture isOnline lastSeen');

        const conversations = new Map();

        messages.forEach(msg => {
            const otherUser = msg.senderId._id.toString() === userId.toString() ? msg.receiverId : msg.senderId;
            const otherUserId = otherUser._id.toString();

            if (!conversations.has(otherUserId)) {
                conversations.set(otherUserId, {
                    otherUser: otherUser,
                    lastMessage: msg,
                    unreadCount: (msg.receiverId._id.toString() === userId.toString() && !msg.read) ? 1 : 0
                });
            } else if (msg.receiverId._id.toString() === userId.toString() && !msg.read) {
                conversations.get(otherUserId).unreadCount++;
            }
        });

        res.status(200).json({
            success: true,
            data: Array.from(conversations.values())
        });
    } catch (error) {
        console.error('Error fetching conversations:', error);
        res.status(500).json({
            success: false,
            message: 'Error fetching conversations'
        });
    }
};
