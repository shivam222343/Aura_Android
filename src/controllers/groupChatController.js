const GroupChat = require('../models/GroupChat');
const Club = require('../models/Club');
const User = require('../models/User');
const { uploadImageBuffer } = require('../config/cloudinary');
const { getCache, setCache, delCache } = require('../utils/cache');

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

        const { limit } = req.query;

        let query = GroupChat.findOne({ clubId })
            .populate('clubId', 'name logo')
            .populate('members.userId', 'displayName profilePicture isOnline')
            .populate('messages.senderId', 'displayName profilePicture')
            .populate('messages.reactions.userId', 'displayName profilePicture')
            .populate('lastMessage.senderId', 'displayName profilePicture');

        if (limit) {
            query = query.slice('messages', -parseInt(limit));
        }

        const cacheKey = `groupchat:${clubId}:${limit || 'full'}`;
        let groupChat = await getCache(cacheKey);
        let fromCache = true;

        if (!groupChat) {
            groupChat = await query;
            if (groupChat) {
                await setCache(cacheKey, groupChat, 300); // Cache for 5 mins
                fromCache = false;
            }
        }

        let unreadCount = 0;
        if (groupChat && limit) {
            // If limit is small (e.g. for main screen), calculate unread count separately or from full doc
            // For now, let's keep it simple: if we are in summary mode, we only care about the count
            // We can optimize this later with a separate count query if needed
            unreadCount = groupChat.messages.filter(msg =>
                !msg.deleted &&
                msg.senderId &&
                msg.senderId.toString() !== userId.toString() &&
                !msg.readBy.some(r => r.userId.toString() === userId.toString())
            ).length;
        }

        if (groupChat) {
            // Convert entire document to object first to preserve all populations
            const groupChatObj = groupChat.toObject();

            // Function to find message by ID and return populated-like object
            const getPopulatedReply = (replyId) => {
                if (!replyId) return null;
                const replyMsg = groupChatObj.messages.find(m => m._id.toString() === replyId.toString());
                if (!replyMsg) return null;

                const sender = groupChatObj.messages.find(m => m.senderId && (m.senderId._id?.toString() === replyMsg.senderId.toString() || m.senderId.toString() === replyMsg.senderId.toString()))?.senderId;

                return {
                    ...replyMsg,
                    senderId: sender || { displayName: 'Member' }
                };
            };

            const filteredMessages = groupChatObj.messages.filter(msg =>
                !msg.deleted &&
                (!msg.deletedFor || !msg.deletedFor.map(id => id.toString()).includes(userId.toString()))
            ).map(msg => {
                if (msg.replyTo) {
                    msg.replyTo = getPopulatedReply(msg.replyTo);
                }
                return msg;
            });

            groupChat = {
                ...groupChatObj,
                messages: filteredMessages,
                unreadCount: unreadCount // Include the calculated unread count
            };
        }

        // ... (rest same: create if not exists)
        if (!groupChat) {
            // ... (keep the same logic for creation)
            const club = await Club.findById(clubId);
            if (!club) return res.status(404).json({ success: false, message: 'Club not found' });
            const clubMembers = await User.find({ 'clubsJoined.clubId': clubId });
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
            data: groupChat,
            source: fromCache ? 'cache' : 'database'
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
        const validTypes = ['text', 'image', 'video', 'document', 'media', 'file', 'poll', 'spinner'];
        if (type && !validTypes.includes(type)) {
            type = req.file ? 'media' : 'text';
        }

        const { pollData, spinnerData } = req.body;

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
            content: content || (fileUrl ? 'Sent an attachment' : type === 'poll' ? 'Created a poll' : type === 'spinner' ? 'Started a spinner' : ''),
            type: type || (fileUrl ? 'media' : 'text'),
            fileUrl: fileUrl ? {
                url: typeof fileUrl === 'string' ? fileUrl : fileUrl.url,
                publicId: publicId || (typeof fileUrl === 'object' ? fileUrl.publicId : null),
                fileName: fileName || (typeof fileUrl === 'object' ? fileUrl.fileName : 'Attachment'),
                fileSize: fileSize || (typeof fileUrl === 'object' ? fileUrl.fileSize : 0),
                mimeType: (typeof fileUrl === 'object' ? fileUrl.mimeType : 'image/jpeg')
            } : null,
            pollData: type === 'poll' ? (typeof pollData === 'string' ? JSON.parse(pollData) : pollData) : undefined,
            spinnerData: type === 'spinner' ? (typeof spinnerData === 'string' ? JSON.parse(spinnerData) : spinnerData) : undefined,
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

        // Invalidate caches
        await delCacheByPattern(`groupchat:${clubId}:*`);

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

        // Invalidate caches
        await delCacheByPattern(`groupchat:${clubId}:*`);

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

        // Invalidate caches
        await delCacheByPattern(`groupchat:${clubId}:*`);

        // Notify others that a user has read messages via socket
        const io = req.app.get('io');
        if (io) {
            // Get user info for the notification
            const User = require('../models/User');
            const reader = await User.findById(userId).select('displayName profilePicture');

            io.to(`club:${clubId}`).emit('group:messages:read', {
                clubId,
                userId,
                reader: {
                    _id: reader._id,
                    displayName: reader.displayName,
                    profilePicture: reader.profilePicture
                },
                readAt: new Date()
            });
        }

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

        // Invalidate caches
        await delCacheByPattern(`groupchat:${clubId}:*`);

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

        // Invalidate caches
        await delCacheByPattern(`groupchat:${clubId}:*`);
        await delCache(`chat:viewers:${messageId}`);

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

/**
 * @desc    Vote on a poll
 * @route   POST /api/group-chat/:clubId/messages/:messageId/vote
 * @access  Private (Club Members)
 */
exports.votePoll = async (req, res) => {
    try {
        const { clubId, messageId } = req.params;
        const { optionIndex } = req.body;
        const userId = req.user._id;

        const groupChat = await GroupChat.findOne({ clubId });
        if (!groupChat) return res.status(404).json({ success: false, message: 'Group chat not found' });

        const message = groupChat.messages.id(messageId);
        if (!message || message.type !== 'poll') return res.status(404).json({ success: false, message: 'Poll not found' });

        // Logic check: multiple choices/max votes
        const maxVotes = message.pollData.maxVotes || 1;

        // Count total votes by this user in this poll
        let userTotalVotes = 0;
        message.pollData.options.forEach(opt => {
            if (opt.votes.includes(userId)) userTotalVotes++;
        });

        // Toggle vote for the specific option
        const alreadyVotedIndex = message.pollData.options[optionIndex].votes.indexOf(userId);

        if (alreadyVotedIndex > -1) {
            // Remove vote
            message.pollData.options[optionIndex].votes.splice(alreadyVotedIndex, 1);
        } else {
            // Check if user hit their limit
            if (userTotalVotes >= maxVotes) {
                // If maxVotes is 1, we replace their existing vote
                if (maxVotes === 1) {
                    message.pollData.options.forEach(opt => {
                        const idx = opt.votes.indexOf(userId);
                        if (idx > -1) opt.votes.splice(idx, 1);
                    });
                } else {
                    return res.status(400).json({ success: false, message: `You can only vote for ${maxVotes} options` });
                }
            }
            // Add vote
            message.pollData.options[optionIndex].votes.push(userId);
        }

        await groupChat.save();

        // Invalidate caches
        await delCacheByPattern(`groupchat:${clubId}:*`);
        await delCacheByPattern(`poll:voters:${messageId}:*`);

        const io = req.app.get('io');
        if (io) {
            io.to(`club:${clubId}`).emit('group:message:update', {
                clubId,
                messageId,
                pollData: message.pollData
            });
        }

        res.status(200).json({ success: true, pollData: message.pollData });
    } catch (error) {
        console.error('Error voting on poll:', error);
        res.status(500).json({ success: false, message: 'Error voting' });
    }
};

/**
 * @desc    Update spinner state or result
 * @route   PUT /api/group-chat/:clubId/messages/:messageId/spin
 * @access  Private (Club Members)
 */
exports.updateSpinner = async (req, res) => {
    try {
        const { clubId, messageId } = req.params;
        const { status, result } = req.body;
        const userId = req.user._id;

        const groupChat = await GroupChat.findOne({ clubId });
        if (!groupChat) return res.status(404).json({ success: false, message: 'Group chat not found' });

        const message = groupChat.messages.id(messageId);
        if (!message || message.type !== 'spinner') return res.status(404).json({ success: false, message: 'Spinner not found' });

        // Only sender can start/set result (or maybe anyone?) 
        // User request: "sender can speen only"
        if (message.senderId.toString() !== userId.toString()) {
            return res.status(403).json({ success: false, message: 'Only the creator can spin' });
        }

        if (status) message.spinnerData.status = status;
        if (result) message.spinnerData.result = result;

        await groupChat.save();

        // Invalidate caches
        await delCacheByPattern(`groupchat:${clubId}:*`);

        const io = req.app.get('io');
        if (io) {
            io.to(`club:${clubId}`).emit('group:message:update', {
                clubId,
                messageId,
                spinnerData: message.spinnerData
            });
        }

        res.status(200).json({ success: true, spinnerData: message.spinnerData });
    } catch (error) {
        console.error('Error updating spinner:', error);
        res.status(500).json({ success: false, message: 'Error updating spinner' });
    }
};

/**
 * @desc    Get users who voted for a specific poll option
 * @route   GET /api/group-chat/:clubId/messages/:messageId/votes/:optionIndex
 * @access  Private (Club Members)
 */
exports.getPollVoters = async (req, res) => {
    try {
        const { clubId, messageId, optionIndex } = req.params;

        const groupChat = await GroupChat.findOne({ clubId });
        if (!groupChat) return res.status(404).json({ success: false, message: 'Group chat not found' });

        const message = groupChat.messages.id(messageId);
        if (!message || message.type !== 'poll') return res.status(404).json({ success: false, message: 'Poll not found' });

        const voters = message.pollData.options[optionIndex].votes;

        const cacheKey = `poll:voters:${messageId}:${optionIndex}`;
        const cachedVoters = await getCache(cacheKey);

        if (cachedVoters) {
            return res.status(200).json({
                success: true,
                data: cachedVoters,
                source: 'cache'
            });
        }

        // Populate voter info
        const populatedVoters = await User.find({ _id: { $in: voters } })
            .select('displayName profilePicture isOnline');

        await setCache(cacheKey, populatedVoters, 300); // 5 mins

        res.status(200).json({
            success: true,
            data: populatedVoters,
            source: 'database'
        });
    } catch (error) {
        console.error('Error fetching poll voters:', error);
        res.status(500).json({ success: false, message: 'Error fetching voters' });
    }
};

/**
 * @desc    Get users who have viewed/read a message
 * @route   GET /api/group-chat/:clubId/messages/:messageId/viewers
 * @access  Private (Club Members)
 */
exports.getMessageViewers = async (req, res) => {
    try {
        const { clubId, messageId } = req.params;

        const groupChat = await GroupChat.findOne({ clubId });
        if (!groupChat) return res.status(404).json({ success: false, message: 'Group chat not found' });

        const message = groupChat.messages.id(messageId);
        if (!message) return res.status(404).json({ success: false, message: 'Message not found' });

        const cacheKey = `chat:viewers:${messageId}`;
        const cachedViewers = await getCache(cacheKey);

        if (cachedViewers) {
            return res.status(200).json({
                success: true,
                data: cachedViewers,
                source: 'cache'
            });
        }

        // Get users who have read this message with their readAt timestamps
        const readByData = message.readBy || [];

        // ... (existing population logic)
        const viewerIds = readByData.map(r => r.userId);
        const users = await User.find({ _id: { $in: viewerIds } })
            .select('displayName profilePicture isOnline');

        const viewersWithTimestamp = users.map(user => {
            const readEntry = readByData.find(r => r.userId.toString() === user._id.toString());
            return {
                _id: user._id,
                displayName: user.displayName,
                profilePicture: user.profilePicture,
                isOnline: user.isOnline,
                readAt: readEntry?.readAt || null
            };
        });

        await setCache(cacheKey, viewersWithTimestamp, 60); // 1 minute

        res.status(200).json({
            success: true,
            data: viewersWithTimestamp,
            source: 'database'
        });
    } catch (error) {
        console.error('Error fetching message viewers:', error);
        res.status(500).json({ success: false, message: 'Error fetching viewers' });
    }
};
