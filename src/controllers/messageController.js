const Message = require('../models/Message');
const User = require('../models/User');
const { sendPushNotification } = require('../utils/pushNotifications');
const { getCache, setCache, delCache } = require('../utils/cache');

/**
 * @desc    Get messages for a conversation
 * @route   GET /api/messages/:userId
 * @access  Private
 */
exports.getMessages = async (req, res) => {
    try {
        const otherUserId = req.params.userId;
        const currentUserId = req.user._id;

        const conversationId = [currentUserId.toString(), otherUserId.toString()].sort().join('-');

        const cacheKey = `messages:${conversationId}:${currentUserId}`;
        const cachedMessages = await getCache(cacheKey);

        if (cachedMessages) {
            return res.status(200).json({
                success: true,
                data: cachedMessages,
                source: 'cache'
            });
        }

        const messages = await Message.find({
            $or: [
                { conversationId },
                { senderId: currentUserId, receiverId: otherUserId },
                { senderId: otherUserId, receiverId: currentUserId }
            ],
            deleted: { $ne: true },
            deletedFor: { $ne: currentUserId }
        })
            .sort({ createdAt: 1 })
            .populate('senderId', 'displayName profilePicture')
            .populate('receiverId', 'displayName profilePicture')
            .populate('replyTo')
            .populate('reactions.userId', 'displayName profilePicture');

        await setCache(cacheKey, messages, 600); // Cache for 10 mins

        res.status(200).json({
            success: true,
            data: messages,
            source: 'database'
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
        let { receiverId, content, type, fileUrl, publicId, fileName, clubId, replyTo, mentionAI, forwarded, isForwarded } = req.body;
        const senderId = req.user._id;

        // Handle file upload
        if (req.file) {
            console.log(`[MessageController] Processing incoming file: ${req.file.originalname} (${req.file.size} bytes)`);
            const { uploadImageBuffer } = require('../config/cloudinary');
            const result = await uploadImageBuffer(req.file.buffer, 'mavericks/messages');
            fileUrl = {
                url: result.url,
                publicId: result.publicId,
                fileName: req.file.originalname,
                fileSize: req.file.size,
                mimeType: req.file.mimetype
            };
            if (!type || type === 'text') type = 'media';
        } else if (fileUrl && typeof fileUrl === 'string') {
            // Support for web-uploaded files
            fileUrl = {
                url: fileUrl,
                publicId: publicId || '',
                fileName: fileName || 'Attachment',
                fileSize: 0,
                mimeType: 'image/jpeg'
            };
            if (!type || type === 'text') type = 'media';
        }


        const conversationId = receiverId ? [senderId.toString(), receiverId.toString()].sort().join('-') : null;

        const newMessage = await Message.create({
            senderId,
            receiverId,
            conversationId,
            content: content || (fileUrl ? 'Sent an attachment' : ''),
            type,
            fileUrl,
            clubId,
            replyTo,
            mentionAI: mentionAI || false,
            forwarded: forwarded || isForwarded || false
        });

        // Populate sender info for the real-time update
        const populatedMessage = await Message.findById(newMessage._id)
            .populate('senderId', 'displayName profilePicture')
            .populate('receiverId', 'displayName profilePicture')
            .populate('replyTo')
            .populate('reactions.userId', 'displayName profilePicture');

        // Socket.io event
        const io = req.app.get('io');
        if (io) {
            io.to(receiverId.toString()).emit('message:receive', populatedMessage);
        }

        // Invalidate conversation and message caches
        await delCache(`messages:${conversationId}:${senderId}`);
        await delCache(`messages:${conversationId}:${receiverId}`);
        await delCache(`conversations:${senderId}`);
        await delCache(`conversations:${receiverId}`);

        res.status(201).json({
            success: true,
            data: populatedMessage
        });

        // Check if receiver is online via socket to avoid redundant push notifications
        const receiverRoom = io.sockets.adapter.rooms.get(receiverId.toString());
        const isReceiverOnline = receiverRoom && receiverRoom.size > 0;

        if (!isReceiverOnline) {
            // Send Push Notification
            sendPushNotification(receiverId, {
                title: populatedMessage.senderId.displayName,
                body: type === 'text' ? content : 'Sent an attachment',
                data: {
                    screen: 'Chat',
                    params: { otherUser: { _id: senderId, displayName: populatedMessage.senderId.displayName } }
                },
                categoryIdentifier: 'chat-reply'
            });
        }

        // Handle AI mention asynchronously
        if (mentionAI || /@Eta/i.test(content)) {
            console.log(`[Message] AI Mention detected in message: ${newMessage._id}`);
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
                        _id: '000000000000000000000000',
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
 * @desc    Send base64 message (for Android compatibility)
 * @route   POST /api/messages/upload-base64
 * @access  Private
 */
exports.sendBase64Message = async (req, res) => {
    try {
        const { receiverId, content, type, replyTo, image } = req.body;
        const senderId = req.user._id;

        if (!image) {
            return res.status(400).json({ success: false, message: 'No media provided' });
        }

        // Convert base64 to buffer
        const base64Data = image.split(',')[1];
        const buffer = Buffer.from(base64Data, 'base64');

        // Upload to Cloudinary
        const result = await uploadImageBuffer(buffer, 'mavericks/chat');

        const newMessage = await Message.create({
            senderId,
            receiverId,
            content: content || 'Sent an attachment',
            type: type || 'media',
            fileUrl: result.url,
            publicId: result.publicId,
            replyTo: (replyTo && replyTo !== 'null' && replyTo !== '') ? replyTo : undefined
        });

        const populatedMessage = await Message.findById(newMessage._id)
            .populate('senderId', 'displayName profilePicture')
            .populate('replyTo');

        // Socket.io event
        const io = req.app.get('io');
        if (io) {
            io.to(receiverId.toString()).emit('message:receive', populatedMessage);
        }

        // Invalidate caches
        const conversationId = [senderId.toString(), receiverId.toString()].sort().join('-');
        await delCache(`messages:${conversationId}:${senderId}`);
        await delCache(`messages:${conversationId}:${receiverId}`);
        await delCache(`conversations:${senderId}`);
        await delCache(`conversations:${receiverId}`);

        res.status(201).json({ success: true, data: populatedMessage });

        // Push Notification if offline
        const receiverRoom = io.sockets.adapter.rooms.get(receiverId.toString());
        if (!receiverRoom || receiverRoom.size === 0) {
            sendPushNotification(receiverId, {
                title: populatedMessage.senderId.displayName,
                body: 'Sent an attachment',
                data: { screen: 'Chat', params: { otherUser: { _id: senderId, displayName: populatedMessage.senderId.displayName } } }
            });
        }
    } catch (error) {
        console.error('Error sending base64 message:', error);
        res.status(500).json({ success: false, message: 'Error sending message' });
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

        // Notify the sender that their messages were read
        const io = req.app.get('io');
        if (io) {
            io.to(otherUserId.toString()).emit('message:read', {
                readerId: currentUserId,
                senderId: otherUserId,
                readAt: new Date()
            });
        }

        // Invalidate conversation caches for unread count updates
        await delCache(`conversations:${otherUserId}`);
        await delCache(`conversations:${currentUserId}`);

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

        const populatedMessage = await Message.findById(message._id)
            .populate('reactions.userId', 'displayName profilePicture');

        const io = req.app.get('io');
        if (io) {
            const room = [message.senderId.toString(), message.receiverId.toString()];
            room.forEach(r => io.to(r).emit('message:reaction', { messageId, reactions: populatedMessage.reactions }));
        }

        // Invalidate messages cache
        const conversationId = [message.senderId.toString(), message.receiverId.toString()].sort().join('-');
        await delCache(`messages:${conversationId}:${message.senderId}`);
        await delCache(`messages:${conversationId}:${message.receiverId}`);

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

        // Invalidate caches
        const conversationId = [message.senderId.toString(), message.receiverId.toString()].sort().join('-');
        await delCache(`messages:${conversationId}:${message.senderId}`);
        await delCache(`messages:${conversationId}:${message.receiverId}`);
        await delCache(`conversations:${message.senderId}`);
        await delCache(`conversations:${message.receiverId}`);

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

        const cacheKey = `conversations:${userId}`;
        const cachedConversations = await getCache(cacheKey);

        if (cachedConversations) {
            return res.status(200).json({
                success: true,
                data: cachedConversations,
                source: 'cache'
            });
        }

        // Find all messages involving the user
        const messages = await Message.find({
            $or: [{ senderId: userId }, { receiverId: userId }],
            deletedFor: { $ne: userId }
        })
            .sort({ createdAt: -1 })
            .populate('senderId', 'displayName profilePicture isOnline lastSeen clubsJoined')
            .populate('receiverId', 'displayName profilePicture isOnline lastSeen clubsJoined');

        const conversations = new Map();

        const userClubIds = (req.user.clubsJoined || []).map(c => c.clubId.toString());

        messages.forEach(msg => {
            // Skip if sender or receiver is not populated properly
            if (!msg.senderId || !msg.receiverId) return;

            const otherUser = msg.senderId._id.toString() === userId.toString() ? msg.receiverId : msg.senderId;

            // Skip if otherUser is null or undefined
            if (!otherUser || !otherUser._id) return;

            const otherUserId = otherUser._id.toString();

            // Skip self-chat
            if (otherUserId === userId.toString()) return;

            // Filter: Only show users who share at least one club
            const otherUserClubIds = (otherUser.clubsJoined || []).map(c => c.clubId.toString());
            const sharesClub = otherUserClubIds.some(id => userClubIds.includes(id));
            if (!sharesClub) return;

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

        const result = Array.from(conversations.values());
        await setCache(cacheKey, result, 600); // 10 mins

        res.status(200).json({
            success: true,
            data: result,
            source: 'database'
        });
    } catch (error) {
        console.error('Error fetching conversations:', error);
        console.error('Error stack:', error.stack);
        console.error('User ID:', req.user?._id);
        res.status(500).json({
            success: false,
            message: 'Error fetching conversations',
            error: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
    }
};
