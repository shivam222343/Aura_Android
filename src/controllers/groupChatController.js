const GroupChat = require('../models/GroupChat');
const Club = require('../models/Club');
const User = require('../models/User');
const { uploadImageBuffer } = require('../config/cloudinary');

/**
 * @desc    Get group chat for a club
 * @route   GET /api/group-chat/:clubId
 * @access  Private (Club Members)
 */
exports.getGroupChat = async (req, res) => {
    try {
        const { clubId } = req.params;
        const userId = req.user._id;

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
            .populate('members.userId', 'displayName profilePicture isOnline')
            .populate('messages.senderId', 'displayName profilePicture')
            .populate('lastMessage.senderId', 'displayName profilePicture');

        // If group chat doesn't exist, create it and add all club members
        if (!groupChat) {
            const club = await Club.findById(clubId);
            if (!club) {
                return res.status(404).json({
                    success: false,
                    message: 'Club not found'
                });
            }

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

        // Calculate unread count for the current user
        const unreadCount = groupChat.messages.filter(msg =>
            !msg.deleted &&
            !msg.readBy.some(r => r.userId.toString() === userId.toString())
        ).length;

        res.status(200).json({
            success: true,
            data: {
                ...(groupChat.toObject ? groupChat.toObject() : groupChat),
                unreadCount
            }
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
        const { clubId } = req.params;
        const { content, type, replyTo } = req.body;
        const userId = req.user._id;

        // Check if user is a member
        const user = await User.findById(userId);
        const isMember = user.clubsJoined.some(c => c.clubId.toString() === clubId);

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
            const result = await uploadImageBuffer(req.file.buffer, 'mavericks/group-chat');
            fileUrl = result.url;
            fileName = req.file.originalname;
            fileSize = req.file.size;
        }

        const newMessage = {
            senderId: userId,
            content: content || (fileUrl ? 'Sent an attachment' : ''),
            type: type || 'text',
            fileUrl,
            fileName,
            fileSize,
            replyTo,
            createdAt: new Date()
        };

        groupChat.messages.push(newMessage);
        await groupChat.save();

        // Populate the new message
        const populatedChat = await GroupChat.findById(groupChat._id)
            .populate('messages.senderId', 'displayName profilePicture');

        const populatedMessage = populatedChat.messages[populatedChat.messages.length - 1];

        // Emit socket event to all group members
        const io = req.app.get('io');
        if (io) {
            groupChat.members.forEach(member => {
                if (member.userId.toString() !== userId.toString()) {
                    io.to(member.userId.toString()).emit('group:message', {
                        clubId,
                        message: populatedMessage
                    });
                }
            });
        }

        res.status(201).json({
            success: true,
            data: populatedMessage
        });
    } catch (error) {
        console.error('Error sending group message:', error);
        res.status(500).json({
            success: false,
            message: 'Error sending message'
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

        // Check if user is the sender or admin
        if (message.senderId.toString() !== userId.toString() && req.user.role !== 'admin') {
            return res.status(403).json({
                success: false,
                message: 'Unauthorized to delete this message'
            });
        }

        message.deleted = true;
        message.deletedAt = new Date();
        message.content = 'This message was deleted';
        message.fileUrl = null;

        await groupChat.save();

        // Emit socket event
        const io = req.app.get('io');
        if (io) {
            io.to(`group:${clubId}`).emit('group:message:delete', { clubId, messageId });
        }

        res.status(200).json({
            success: true,
            message: 'Message deleted'
        });
    } catch (error) {
        console.error('Error deleting group message:', error);
        res.status(500).json({
            success: false,
            message: 'Error deleting message'
        });
    }
};

/**
 * @desc    Add reaction to group message
 * @route   POST /api/group-chat/:clubId/messages/:messageId/reaction
 * @access  Private (Club Members)
 */
exports.addGroupReaction = async (req, res) => {
    try {
        const { clubId, messageId } = req.params;
        const { emoji } = req.body;
        const userId = req.user._id;

        const groupChat = await GroupChat.findOne({ clubId });
        if (!groupChat) return res.status(404).json({ success: false, message: 'Group chat not found' });

        const message = groupChat.messages.id(messageId);
        if (!message) return res.status(404).json({ success: false, message: 'Message not found' });

        // Remove existing reaction from this user if any
        message.reactions = message.reactions.filter(r => r.userId.toString() !== userId.toString());

        // Add new reaction
        message.reactions.push({ userId, emoji });

        await groupChat.save();

        // Emit socket event
        const io = req.app.get('io');
        if (io) {
            io.to(`group:${clubId}`).emit('group:message:reaction', { clubId, messageId, reactions: message.reactions });
        }

        res.status(200).json({
            success: true,
            data: message.reactions
        });
    } catch (error) {
        console.error('Error adding reaction:', error);
        res.status(500).json({ success: false, message: 'Error adding reaction' });
    }
};

/**
 * @desc    Update group settings (Name, Icon)
 * @route   PUT /api/group-chat/:clubId/settings
 * @access  Private (Club Admin)
 */
exports.updateGroupSettings = async (req, res) => {
    try {
        const { clubId } = req.params;
        const { name } = req.body;
        const userId = req.user._id;

        const groupChat = await GroupChat.findOne({ clubId });
        if (!groupChat) {
            return res.status(404).json({ success: false, message: 'Group chat not found' });
        }

        // Check if user is an admin of the group
        const member = groupChat.members.find(m => m.userId.toString() === userId.toString());
        if (!member || (member.role !== 'admin' && req.user.role !== 'admin')) {
            return res.status(403).json({ success: false, message: 'Only admins can update group settings' });
        }

        if (name) groupChat.name = name;

        if (req.file) {
            const result = await uploadImageBuffer(req.file.buffer, 'mavericks/group-icons');
            groupChat.groupIcon = {
                url: result.url,
                publicId: result.publicId
            };
        }

        await groupChat.save();

        // Emit socket event for real-time settings update
        const io = req.app.get('io');
        if (io) {
            io.to(`group:${clubId}`).emit('group:settings_update', groupChat);
        }

        res.status(200).json({
            success: true,
            data: groupChat
        });
    } catch (error) {
        console.error('Error updating group settings:', error);
        res.status(500).json({
            success: false,
            message: 'Error updating group settings'
        });
    }
};
/**
 * @desc    Get total unread count for all group chats
 * @route   GET /api/group-chat/unread/total
 * @access  Private
 */
exports.getGroupsUnreadCount = async (req, res) => {
    try {
        const userId = req.user._id;
        // Find all group chats where user is a member
        const groupChats = await GroupChat.find({ 'members.userId': userId });

        let totalUnread = 0;
        groupChats.forEach(chat => {
            const unreadInChat = chat.messages.filter(msg =>
                !msg.deleted &&
                !msg.readBy.some(r => r.userId.toString() === userId.toString())
            ).length;
            totalUnread += unreadInChat;
        });

        res.status(200).json({
            success: true,
            totalUnread
        });
    } catch (error) {
        console.error('Error fetching total group unread count:', error);
        res.status(500).json({ success: false, message: 'Error fetching total unread count' });
    }
};
