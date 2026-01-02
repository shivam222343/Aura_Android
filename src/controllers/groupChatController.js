const GroupChat = require('../models/GroupChat');
const Club = require('../models/Club');
const User = require('../models/User');
const { uploadImage } = require('../config/cloudinary');

/**
 * @desc    Get group chat for a club
 * @route   GET /api/group-chat/:clubId
 * @access  Private (Club Members)
 */
exports.getGroupChat = async (req, res) => {
    try {
        let { clubId } = req.params;
        const userId = req.user._id;

        // Ensure clubId is a string if it's passed as an object
        if (clubId && typeof clubId === 'object' && clubId._id) {
            clubId = clubId._id.toString();
        }

        // Check if user is a member of the club
        const user = await User.findById(userId);
        const isMember = user.clubsJoined.some(c => c.clubId.toString() === clubId);

        if (!isMember && req.user.role !== 'admin') {
            return res.status(403).json({
                success: false,
                message: 'You must be a member of this club to access the group chat'
            });
        }

        let groupChat = await GroupChat.findOne({ clubId })
            .populate('clubId', 'name logo')
            .populate('members.userId', 'displayName profilePicture isOnline')
            .populate('messages.senderId', 'displayName profilePicture')
            .populate('messages.reactions.userId', 'displayName profilePicture')
            .populate('lastMessage.senderId', 'displayName profilePicture');

        if (groupChat) {
            // Function to find message by ID and return populated-like object
            const getPopulatedReply = (replyId) => {
                if (!replyId) return null;
                const replyMsg = groupChat.messages.id(replyId);
                if (!replyMsg) return null;

                // Find sender info from populated members or messages
                const sender = groupChat.messages.find(m => m.senderId && (m.senderId._id?.toString() === replyMsg.senderId.toString() || m.senderId.toString() === replyMsg.senderId.toString()))?.senderId;

                return {
                    ...replyMsg.toObject(),
                    senderId: sender || { displayName: 'Member' }
                };
            };

            // Manually populate replyTo for filtered messages
            const filteredMessages = groupChat.messages.filter(msg =>
                !msg.deleted &&
                (!msg.deletedFor || !msg.deletedFor.includes(userId))
            ).map(msg => {
                const msgObj = msg.toObject();
                if (msgObj.replyTo) {
                    msgObj.replyTo = getPopulatedReply(msgObj.replyTo);
                }
                return msgObj;
            });

            groupChat = groupChat.toObject();
            groupChat.messages = filteredMessages;
        }

        // If group chat doesn't exist, create it and add all club members
        if (!groupChat) {
            const club = await Club.findById(clubId);
            if (!club) {
                return res.status(404).json({
                    success: false,
                    message: 'Club not found'
                });
            }

            // Get all club members
            const clubMembers = await User.find({
                'clubsJoined.clubId': clubId
            });

            groupChat = await GroupChat.create({
                clubId,
                name: `${club.name} Group Chat`,
                description: `Group chat for ${club.name} members`,
                members: clubMembers.map(member => ({
                    userId: member._id,
                    role: member.clubsJoined.find(c => c.clubId.toString() === clubId)?.role || 'member'
                })),
                messages: []
            });

            groupChat = await GroupChat.findById(groupChat._id)
                .populate('members.userId', 'displayName profilePicture isOnline')
                .populate('messages.senderId', 'displayName profilePicture');
        }

        res.status(200).json({
            success: true,
            data: groupChat
        });
    } catch (error) {
        console.error('Error fetching group chat:', error);
        res.status(500).json({
            success: false,
            message: 'Error fetching group chat'
        });
    }
};

/**
 * @desc    Send message to group chat
 * @route   POST /api/group-chat/:clubId/messages
 * @access  Private (Club Members)
 */
exports.sendGroupMessage = async (req, res) => {
    try {
        let { clubId } = req.params;
        const { content, type, replyTo } = req.body;
        const userId = req.user._id;

        // Ensure clubId is a string if it's passed as an object
        if (clubId && typeof clubId === 'object' && clubId._id) {
            clubId = clubId._id.toString();
        }

        console.log(`[GroupChat] Message request from user ${userId} to club ${clubId}`);
        console.log('[GroupChat] Request Body:', req.body);
        console.log('[GroupChat] Request File:', req.file ? 'Present' : 'None');

        // Check if user is a member
        const user = await User.findById(userId);
        if (!user) {
            return res.status(404).json({ success: false, message: 'User not found' });
        }

        const isMember = user.clubsJoined?.some(c => {
            const cId = c.clubId?._id || c.clubId;
            return cId?.toString() === clubId;
        });

        if (!isMember && req.user.role !== 'admin') {
            return res.status(403).json({
                success: false,
                message: 'You must be a member of this club to send messages'
            });
        }

        let groupChat = await GroupChat.findOne({ clubId });

        if (!groupChat) {
            return res.status(404).json({
                success: false,
                message: 'Group chat not found'
            });
        }

        // Handle file upload if present
        let fileUrl = null;
        let fileName = null;
        let fileSize = null;

        if (req.file) {
            try {
                const result = await uploadImage(req.file.path, 'mavericks/group-chat');
                fileUrl = result.url;
                fileName = req.file.originalname;
                fileSize = req.file.size;
            } catch (uploadError) {
                console.error('[GroupChat] Cloudinary upload error:', uploadError);
                return res.status(500).json({ success: false, message: 'Failed to upload attachment' });
            }
        }

        const newMessage = {
            senderId: userId,
            content: content || (fileUrl ? 'Sent an attachment' : ''),
            type: type || (fileUrl ? 'media' : 'text'),
            fileUrl,
            fileName,
            fileSize,
            replyTo: (replyTo && replyTo !== 'null' && replyTo !== '') ? replyTo : undefined,
            createdAt: new Date()
        };

        groupChat.messages.push(newMessage);

        // Update last message
        groupChat.lastMessage = {
            senderId: userId,
            content: newMessage.content,
            createdAt: newMessage.createdAt
        };

        await groupChat.save();

        // Instead of populating the whole chat (slow), just get the sender info
        const senderInfo = await User.findById(userId).select('displayName profilePicture');

        const lastSavedMessage = groupChat.messages[groupChat.messages.length - 1];
        const populatedMessage = {
            ...lastSavedMessage.toObject(),
            senderId: senderInfo
        };

        // Handle replyTo population for the socket/response
        if (populatedMessage.replyTo) {
            const replyMsg = groupChat.messages.id(populatedMessage.replyTo);
            if (replyMsg) {
                const replySender = await User.findById(replyMsg.senderId).select('displayName profilePicture');
                populatedMessage.replyTo = {
                    ...replyMsg.toObject(),
                    senderId: replySender
                };
            }
        }

        // Emit socket event to the club room (MUCH faster than looping)
        const io = req.app.get('io');
        if (io) {
            io.to(`club:${clubId}`).emit('group:message', {
                clubId,
                message: populatedMessage
            });
        }

        res.status(201).json({
            success: true,
            data: populatedMessage
        });
    } catch (error) {
        console.error('[GroupChat] Error sending message:', error);
        res.status(500).json({
            success: false,
            message: 'Error sending message',
            error: error.message
        });
    }
};

/**
 * @desc    Mark messages as read in group chat
 * @route   PUT /api/group-chat/:clubId/read
 * @access  Private (Club Members)
 */
exports.markGroupMessagesRead = async (req, res) => {
    try {
        const { clubId } = req.params;
        const userId = req.user._id;

        const groupChat = await GroupChat.findOne({ clubId });

        if (!groupChat) {
            return res.status(404).json({
                success: false,
                message: 'Group chat not found'
            });
        }

        // Mark all unread messages as read
        groupChat.messages.forEach(msg => {
            if (!msg.readBy.some(r => r.userId.toString() === userId.toString())) {
                msg.readBy.push({ userId, readAt: new Date() });
            }
        });

        await groupChat.save();

        res.status(200).json({
            success: true,
            message: 'Messages marked as read'
        });
    } catch (error) {
        console.error('Error marking messages as read:', error);
        res.status(500).json({
            success: false,
            message: 'Error marking messages as read'
        });
    }
};

/**
 * @desc    Delete message from group chat
 * @route   DELETE /api/group-chat/:clubId/messages/:messageId
 * @access  Private (Message Owner or Admin)
 */
exports.deleteGroupMessage = async (req, res) => {
    try {
        const { clubId, messageId } = req.params;
        const userId = req.user._id;

        const groupChat = await GroupChat.findOne({ clubId });

        if (!groupChat) {
            return res.status(404).json({
                success: false,
                message: 'Group chat not found'
            });
        }

        const message = groupChat.messages.id(messageId);

        if (!message) {
            return res.status(404).json({
                success: false,
                message: 'Message not found'
            });
        }

        const { type } = req.query; // 'me' or 'everyone'
        message.deleted = false; // Initial check

        if (type === 'everyone') {
            // Check if user is the sender or admin
            if (message.senderId.toString() !== userId.toString() && req.user.role !== 'admin') {
                return res.status(403).json({
                    success: false,
                    message: 'Unauthorized to delete this message for everyone'
                });
            }
            message.deleted = true;
            message.deletedAt = new Date();
            message.content = 'This message was deleted';
            message.fileUrl = null;
        } else {
            // Delete for me
            if (!message.deletedFor) message.deletedFor = [];
            if (!message.deletedFor.includes(userId)) {
                message.deletedFor.push(userId);
            }
        }

        await groupChat.save();

        // Emit socket event to the club room if deleted for everyone
        const io = req.app.get('io');
        if (io && type === 'everyone') {
            io.to(`club:${clubId}`).emit('group:message:delete', {
                clubId,
                messageId
            });
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
 * @desc    Get unread message count for group chat
 * @route   GET /api/group-chat/:clubId/unread-count
 * @access  Private (Club Members)
 */
exports.getUnreadCount = async (req, res) => {
    try {
        const { clubId } = req.params;
        const userId = req.user._id;

        const groupChat = await GroupChat.findOne({ clubId });

        if (!groupChat) {
            return res.status(200).json({
                success: true,
                data: { unreadCount: 0 }
            });
        }

        // Count messages that don't have the current user in readBy
        const unreadCount = groupChat.messages.filter(msg =>
            !msg.deleted &&
            msg.senderId.toString() !== userId.toString() &&
            !msg.readBy.some(r => r.userId.toString() === userId.toString())
        ).length;

        res.status(200).json({
            success: true,
            data: { unreadCount }
        });
    } catch (error) {
        console.error('Error fetching unread count:', error);
        res.status(500).json({
            success: false,
            message: 'Error fetching unread count'
        });
    }
};
/**
 * @desc    Add/Update reaction to a group message
 * @route   POST /api/group-chat/:clubId/messages/:messageId/reaction
 * @access  Private (Club Members)
 */
exports.addReaction = async (req, res) => {
    try {
        const { clubId, messageId } = req.params;
        const { emoji } = req.body;
        const userId = req.user._id;

        const groupChat = await GroupChat.findOne({ clubId });
        if (!groupChat) {
            return res.status(404).json({ success: false, message: 'Group chat not found' });
        }

        const message = groupChat.messages.id(messageId);
        if (!message) {
            return res.status(404).json({ success: false, message: 'Message not found' });
        }

        if (!message.reactions) message.reactions = [];

        const existingReactionIndex = message.reactions.findIndex(
            r => r.userId.toString() === userId.toString()
        );

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

        await groupChat.save();

        // Populate the reactions user info before emitting
        const populatedGroupChat = await GroupChat.findOne({ clubId })
            .populate('messages.reactions.userId', 'displayName profilePicture');

        const populatedMessage = populatedGroupChat.messages.id(messageId);

        const io = req.app.get('io');
        if (io) {
            io.to(`club:${clubId}`).emit('group:message:reaction', {
                clubId,
                messageId,
                reactions: populatedMessage.reactions
            });
        }

        res.status(200).json({
            success: true,
            data: populatedMessage.reactions
        });
    } catch (error) {
        console.error('Error adding reaction:', error);
        res.status(500).json({
            success: false,
            message: 'Error adding reaction'
        });
    }
};
