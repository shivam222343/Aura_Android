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
            // Convert entire document to object first to preserve all populations
            const groupChatObj = groupChat.toObject();

            // Function to find message by ID and return populated-like object (working on plain objects now)
            const getPopulatedReply = (replyId) => {
                if (!replyId) return null;
                // Find in the plain array
                const replyMsg = groupChatObj.messages.find(m => m._id.toString() === replyId.toString());
                if (!replyMsg) return null;

                // Find sender info
                const sender = groupChatObj.messages.find(m => m.senderId && (m.senderId._id?.toString() === replyMsg.senderId.toString() || m.senderId.toString() === replyMsg.senderId.toString()))?.senderId;

                return {
                    ...replyMsg,
                    senderId: sender || { displayName: 'Member' }
                };
            };

            // Manually populate replyTo for filtered messages
            const filteredMessages = groupChatObj.messages.filter(msg =>
                !msg.deleted &&
                (!msg.deletedFor || !msg.deletedFor.map(id => id.toString()).includes(userId.toString()))
            ).map(msg => {
                // msg is already a plain object
                if (msg.replyTo) {
                    msg.replyTo = getPopulatedReply(msg.replyTo);
                }
                return msg;
            });

            groupChat = groupChatObj;
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
        let { content, type, replyTo } = req.body;
        const userId = req.user._id;

        // Ensure clubId is a string if it's passed as an object
        if (clubId && typeof clubId === 'object' && clubId._id) {
            clubId = clubId._id.toString();
        }

        console.log(`[GroupChat] Message request from user ${userId} to club ${clubId}`);

        // Normalize message type to match schema enum
        const validTypes = ['text', 'image', 'video', 'document', 'media', 'file'];
        if (type && !validTypes.includes(type)) {
            type = req.file ? 'media' : 'text';
        }

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
        let fileUrl = req.body.fileUrl || null;
        let fileName = req.body.fileName || null;
        let fileSize = req.body.fileSize || null;
        let publicId = req.body.publicId || null;

        if (req.file) {
            try {
                const result = await uploadImageBuffer(req.file.buffer, 'mavericks/group-chat');
                fileUrl = result.url;
                fileName = req.file.originalname;
                fileSize = req.file.size;
                publicId = result.publicId;
            } catch (uploadError) {
                console.error('[GroupChat] Cloudinary upload error:', uploadError);
                return res.status(500).json({ success: false, message: 'Failed to upload attachment' });
            }
        }

        const newMessage = {
            senderId: userId,
            content: content || (fileUrl ? 'Sent an attachment' : ''),
            type: type || (fileUrl ? 'media' : 'text'),
            fileUrl: fileUrl ? {
                url: typeof fileUrl === 'string' ? fileUrl : fileUrl.url,
                publicId: publicId || (typeof fileUrl === 'object' ? fileUrl.publicId : null),
                fileName: fileName || (typeof fileUrl === 'object' ? fileUrl.fileName : 'Attachment'),
                fileSize: fileSize || (typeof fileUrl === 'object' ? fileUrl.fileSize : 0),
                mimeType: (typeof fileUrl === 'object' ? fileUrl.mimeType : 'image/jpeg')
            } : null,
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

        // Handle AI Mention asynchronously
        if (content && /@Eta/i.test(content)) {
            console.log(`[GroupChat] AI Mention detected in club ${clubId}`);
            const aiController = require('./aiController');

            const aiResponse = await aiController.handleGroupAIMention(
                clubId,
                groupChat,
                lastSavedMessage
            );

            if (aiResponse && io) {
                io.to(`club:${clubId}`).emit('group:message', {
                    clubId,
                    message: aiResponse
                });
            }
        }
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
 * @desc    Send base64 message to group chat (for Android compatibility)
 * @route   POST /api/group-chat/:clubId/messages-base64
 * @access  Private (Club Members)
 */
exports.sendBase64GroupMessage = async (req, res) => {
    try {
        let { clubId } = req.params;
        let { content, type, replyTo, image } = req.body;
        const userId = req.user._id;

        if (!image) {
            return res.status(400).json({ success: false, message: 'No media provided' });
        }

        // Check if user is a member
        const user = await User.findById(userId);
        const isMember = user.clubsJoined?.some(c => {
            const cId = c.clubId?._id || c.clubId;
            return cId?.toString() === clubId;
        });

        if (!isMember && req.user.role !== 'admin') {
            return res.status(403).json({ success: false, message: 'Access denied' });
        }

        // Convert base64 to buffer
        const base64Data = image.split(',')[1];
        const buffer = Buffer.from(base64Data, 'base64');

        // Upload to Cloudinary
        const result = await uploadImageBuffer(buffer, 'mavericks/chat');

        let groupChat = await GroupChat.findOne({ clubId });
        if (!groupChat) {
            groupChat = await GroupChat.create({ clubId, messages: [], members: [] });
        }

        const newMessage = {
            senderId: userId,
            content: content || 'Sent an attachment',
            type: type || 'media',
            fileUrl: {
                url: result.url,
                publicId: result.publicId,
                fileName: 'Attachment',
                mimeType: image.includes('video') ? 'video/mp4' : 'image/jpeg'
            },
            replyTo: (replyTo && replyTo !== 'null' && replyTo !== '') ? replyTo : undefined,
            createdAt: new Date()
        };

        groupChat.messages.push(newMessage);
        await groupChat.save();

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

        // Emit via socket
        const io = req.app.get('io');
        if (io) {
            io.to(`club:${clubId}`).emit('group:message', {
                clubId,
                message: populatedMessage
            });
        }

        res.status(201).json({ success: true, data: populatedMessage });
    } catch (error) {
        console.error('Error sending base64 group message:', error);
        res.status(500).json({ success: false, message: 'Error sending message' });
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
                reactions: populatedMessage.toObject().reactions
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
