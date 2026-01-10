const Snap = require('../models/Snap');
const User = require('../models/User');
const { uploadImageBuffer } = require('../config/cloudinary');
const { sendPushNotificationToMany } = require('../utils/notifications');
const Club = require('../models/Club');

/**
 * @desc    Upload a snap
 * @route   POST /api/snaps
 * @access  Private
 */
exports.uploadSnap = async (req, res) => {
    try {
        console.log('[SnapController] Upload attempt:', {
            body: req.body,
            file: req.file ? {
                fieldname: req.file.fieldname,
                originalname: req.file.originalname,
                mimetype: req.file.mimetype,
                size: req.file.size
            } : 'No file received'
        });

        const { clubId, caption, type, recipients, imageUrl, publicId } = req.body;
        const senderId = req.user._id;

        let recipientsList = [];
        if (recipients) {
            try {
                recipientsList = typeof recipients === 'string' ? JSON.parse(recipients) : recipients;
            } catch (e) {
                // If it's a single ID passed as string
                if (typeof recipients === 'string' && recipients.length > 0) {
                    recipientsList = [recipients];
                }
            }
        }

        let result = null;
        if (req.file) {
            result = await uploadImageBuffer(req.file.buffer, 'mavericks/snaps');
        } else if (imageUrl) {
            result = { url: imageUrl, publicId: publicId || '' };
        } else {
            return res.status(400).json({ success: false, message: 'Please upload an image/video or provide a URL' });
        }

        const expiresAt = new Date();
        expiresAt.setHours(expiresAt.getHours() + 24);

        const snap = await Snap.create({
            senderId,
            clubId,
            mediaUrl: {
                url: result.url,
                publicId: result.publicId
            },
            type: type || 'image',
            caption,
            recipients: recipientsList,
            expiresAt
        });

        const populatedSnap = await Snap.findById(snap._id).populate('senderId', 'displayName profilePicture');

        // Notify club room
        const io = req.app.get('io');
        if (io) {
            if (recipientsList && recipientsList.length > 0) {
                recipientsList.forEach(recipientId => {
                    io.to(recipientId.toString()).emit('snap:new', populatedSnap);
                });
                io.to(senderId.toString()).emit('snap:new', populatedSnap);
            } else {
                io.to(`club:${clubId}`).emit('snap:new', populatedSnap);
            }
        }

        res.status(201).json({
            success: true,
            data: populatedSnap
        });

        // Trigger Push Notifications
        try {
            let targetUserIds = [];
            if (recipientsList && recipientsList.length > 0) {
                targetUserIds = recipientsList.filter(id => id.toString() !== senderId.toString());
            } else {
                const club = await Club.findById(clubId).populate('members.userId');
                if (club) {
                    targetUserIds = club.members
                        .filter(m => m.userId && m.userId._id.toString() !== senderId.toString())
                        .map(m => m.userId._id);
                }
            }

            if (targetUserIds.length > 0) {
                sendPushNotificationToMany(targetUserIds, {
                    title: 'New Snap!',
                    body: `${populatedSnap.senderId.displayName} shared a new snap`,
                    data: { screen: 'Messages', params: { selectedClub: clubId } }
                });
            }
        } catch (notifError) {
            console.error('Error triggering snap notification:', notifError);
        }
    } catch (error) {
        console.error('Error uploading snap:', error);
        res.status(500).json({
            success: false,
            message: 'Error uploading snap'
        });
    }
};

/**
 * @desc    Upload a snap using base64 (for Android compatibility)
 * @route   POST /api/snaps/upload-base64
 * @access  Private
 */
exports.uploadBase64Snap = async (req, res) => {
    try {
        console.log('[SnapController] Base64 upload attempt');

        const { clubId, caption, type, recipients, media } = req.body;
        const senderId = req.user._id;

        if (!media) {
            return res.status(400).json({ success: false, message: 'Please provide media data' });
        }

        let recipientsList = [];
        if (recipients) {
            try {
                recipientsList = typeof recipients === 'string' ? JSON.parse(recipients) : recipients;
            } catch (e) {
                if (typeof recipients === 'string' && recipients.length > 0) {
                    recipientsList = [recipients];
                }
            }
        }

        // Convert base64 to buffer
        const base64Data = media.split(',')[1];
        const buffer = Buffer.from(base64Data, 'base64');

        // Upload to Cloudinary
        const result = await uploadImageBuffer(buffer, 'mavericks/snaps');

        const expiresAt = new Date();
        expiresAt.setHours(expiresAt.getHours() + 24);

        const snap = await Snap.create({
            senderId,
            clubId,
            mediaUrl: {
                url: result.url,
                publicId: result.publicId
            },
            type: type || 'image',
            caption,
            recipients: recipientsList,
            expiresAt
        });

        const populatedSnap = await Snap.findById(snap._id).populate('senderId', 'displayName profilePicture');

        // Notify club room via Socket.io
        const io = req.app.get('io');
        if (io) {
            if (recipientsList && recipientsList.length > 0) {
                recipientsList.forEach(recipientId => {
                    io.to(recipientId.toString()).emit('snap:new', populatedSnap);
                });
                io.to(senderId.toString()).emit('snap:new', populatedSnap);
            } else {
                io.to(`club:${clubId}`).emit('snap:new', populatedSnap);
            }
        }

        res.status(201).json({
            success: true,
            data: populatedSnap
        });

        // Trigger Push Notifications
        try {
            let targetUserIds = [];
            if (recipientsList && recipientsList.length > 0) {
                targetUserIds = recipientsList.filter(id => id.toString() !== senderId.toString());
            } else {
                const club = await Club.findById(clubId).populate('members.userId');
                if (club) {
                    targetUserIds = club.members
                        .filter(m => m.userId && m.userId._id.toString() !== senderId.toString())
                        .map(m => m.userId._id);
                }
            }

            if (targetUserIds.length > 0) {
                sendPushNotificationToMany(targetUserIds, {
                    title: 'New Snap!',
                    body: `${populatedSnap.senderId.displayName} shared a new snap`,
                    data: { screen: 'Messages', params: { selectedClub: clubId } }
                });
            }
        } catch (notifError) {
            console.error('Error triggering snap notification:', notifError);
        }
    } catch (error) {
        console.error('Error uploading base64 snap:', error);
        res.status(500).json({
            success: false,
            message: 'Error uploading snap'
        });
    }
};

/**
 * @desc    Get active snaps for a club
 * @route   GET /api/snaps/club/:clubId
 * @access  Private
 */
exports.getClubSnaps = async (req, res) => {
    try {
        const clubId = req.params.clubId;
        const userId = req.user._id;
        const now = new Date();

        // Find snaps that are:
        // 1. In this club
        // 2. Not expired
        // 3. Not deleted
        // 4. EITHER visible to everyone (recipients empty) OR visible to this user specifically OR sent by this user
        const snaps = await Snap.find({
            clubId,
            expiresAt: { $gt: now },
            deleted: { $ne: true },
            $or: [
                { recipients: { $exists: false } },
                { recipients: { $size: 0 } },
                { recipients: userId },
                { senderId: userId }
            ]
        })
            .sort({ createdAt: -1 })
            .populate('senderId', 'displayName profilePicture');

        // Group by user
        const userSnaps = new Map();
        snaps.forEach(snap => {
            if (!snap.senderId) return; // Skip snaps with deleted users
            const snapSenderId = snap.senderId._id.toString();
            if (!userSnaps.has(snapSenderId)) {
                userSnaps.set(snapSenderId, {
                    user: snap.senderId,
                    snaps: []
                });
            }
            userSnaps.get(snapSenderId).snaps.push(snap);
        });

        res.status(200).json({
            success: true,
            data: Array.from(userSnaps.values())
        });
    } catch (error) {
        console.error('Error fetching snaps:', error);
        res.status(500).json({
            success: false,
            message: 'Error fetching snaps'
        });
    }
};

/**
 * @desc    Get active snaps from all clubs user has joined
 * @route   GET /api/snaps/my-clubs
 * @access  Private
 */
exports.getMySnaps = async (req, res) => {
    try {
        const userId = req.user._id;
        const now = new Date();

        // Get all club IDs user has joined
        const userClubIds = req.user.clubsJoined.map(c => c.clubId);

        if (!userClubIds || userClubIds.length === 0) {
            return res.status(200).json({ success: true, data: [] });
        }

        // Find snaps in any of these clubs
        const snaps = await Snap.find({
            clubId: { $in: userClubIds },
            expiresAt: { $gt: now },
            deleted: { $ne: true },
            $or: [
                { recipients: { $exists: false } },
                { recipients: { $size: 0 } },
                { recipients: userId },
                { senderId: userId }
            ]
        })
            .sort({ createdAt: -1 })
            .populate('senderId', 'displayName profilePicture');

        // Group by user
        const userSnaps = new Map();
        snaps.forEach(snap => {
            if (!snap.senderId) return; // Skip snaps with deleted users
            const snapSenderId = snap.senderId._id.toString();
            if (!userSnaps.has(snapSenderId)) {
                userSnaps.set(snapSenderId, {
                    user: snap.senderId,
                    snaps: []
                });
            }
            userSnaps.get(snapSenderId).snaps.push(snap);
        });

        res.status(200).json({
            success: true,
            data: Array.from(userSnaps.values())
        });
    } catch (error) {
        console.error('Error fetching my snaps:', error);
        res.status(500).json({
            success: false,
            message: 'Error fetching snaps'
        });
    }
};

/**
 * @desc    Mark snap as viewed
 * @route   POST /api/snaps/:snapId/view
 * @access  Private
 */
exports.viewSnap = async (req, res) => {
    try {
        const snapId = req.params.snapId;
        const userId = req.user._id;

        const snap = await Snap.findById(snapId);
        if (!snap) {
            return res.status(404).json({ success: false, message: 'Snap not found' });
        }

        if (!snap.viewedBy.some(v => v.userId.toString() === userId.toString())) {
            snap.viewedBy.push({ userId });
            await snap.save();
        }

        res.status(200).json({
            success: true,
            message: 'Snap marked as viewed'
        });
    } catch (error) {
        console.error('Error viewing snap:', error);
        res.status(500).json({
            success: false,
            message: 'Error viewing snap'
        });
    }
};

/**
 * @desc    Delete a snap
 * @route   DELETE /api/snaps/:snapId
 * @access  Private
 */
exports.deleteSnap = async (req, res) => {
    try {
        const snapId = req.params.snapId;
        const userId = req.user._id;

        const snap = await Snap.findOne({ _id: snapId, senderId: userId });

        if (!snap) {
            return res.status(404).json({ success: false, message: 'Snap not found or unauthorized' });
        }

        snap.deleted = true;
        await snap.save();

        // Notify socketrooms to remove this snap
        const io = req.app.get('io');
        if (io) {
            io.emit('snap:delete', snapId);
        }

        res.status(200).json({ success: true, message: 'Snap deleted' });
    } catch (error) {
        console.error('Error deleting snap:', error);
        res.status(500).json({ success: false, message: 'Error deleting snap' });
    }
};

/**
 * @desc    Get snap viewers
 * @route   GET /api/snaps/:snapId/viewers
 * @access  Private
 */
exports.getSnapViewers = async (req, res) => {
    try {
        const snapId = req.params.snapId;
        const userId = req.user._id;

        const snap = await Snap.findOne({ _id: snapId, senderId: userId })
            .populate('viewedBy.userId', 'displayName profilePicture email');

        if (!snap) {
            return res.status(404).json({ success: false, message: 'Snap not found or unauthorized' });
        }

        // Format viewers list with time and liked status
        const viewers = snap.viewedBy.map(v => ({
            _id: v.userId._id,
            displayName: v.userId.displayName,
            profilePicture: v.userId.profilePicture,
            viewedAt: v.viewedAt,
            hasLiked: snap.likes.some(likeId => likeId.toString() === v.userId._id.toString())
        }));

        res.status(200).json({ success: true, data: viewers });
    } catch (error) {
        console.error('Error getting snap viewers:', error);
        res.status(500).json({ success: false, message: 'Error getting snap viewers' });
    }
};

/**
 * @desc    Update snap caption
 * @route   PUT /api/snaps/:snapId/caption
 * @access  Private
 */
exports.updateSnapCaption = async (req, res) => {
    try {
        const { snapId } = req.params;
        const { caption } = req.body;
        const userId = req.user._id;

        const snap = await Snap.findOne({ _id: snapId, senderId: userId });

        if (!snap) {
            return res.status(404).json({ success: false, message: 'Snap not found or unauthorized' });
        }

        snap.caption = caption;
        await snap.save();

        res.status(200).json({ success: true, data: snap });
    } catch (error) {
        console.error('Error updating snap caption:', error);
        res.status(500).json({ success: false, message: 'Error updating snap caption' });
    }
};

/**
 * @desc    Toggle like on snap
 * @route   POST /api/snaps/:snapId/like
 * @access  Private
 */
exports.toggleLike = async (req, res) => {
    try {
        const snapId = req.params.snapId;
        const userId = req.user._id;

        const snap = await Snap.findById(snapId);
        if (!snap) {
            return res.status(404).json({ success: false, message: 'Snap not found' });
        }

        const likeIndex = snap.likes.indexOf(userId);
        if (likeIndex > -1) {
            // Already liked, so unlike
            snap.likes.splice(likeIndex, 1);
        } else {
            // Not liked, so like
            snap.likes.push(userId);
        }

        await snap.save();

        const isLiked = likeIndex === -1;

        // If liked, notify the snap owner
        if (isLiked && snap.senderId.toString() !== userId.toString()) {
            try {
                const liker = await User.findById(userId).select('displayName');
                if (liker) {
                    sendPushNotificationToMany([snap.senderId], {
                        title: 'Snap Liked! ❤️',
                        body: `${liker.displayName} liked your snap`,
                        data: { screen: 'Messages', params: { viewSnapId: snapId } }
                    });
                }
            } catch (notifErr) {
                console.error('Error sending snap like notification:', notifErr);
            }
        }

        // Notify club via socket
        const io = req.app.get('io');
        if (io) {
            io.to(`club:${snap.clubId}`).emit('snap:like', { snapId, likes: snap.likes });
        }

        res.status(200).json({
            success: true,
            likes: snap.likes,
            liked: likeIndex === -1
        });
    } catch (error) {
        console.error('Error toggling like on snap:', error);
        res.status(500).json({ success: false, message: 'Error toggling like' });
    }
};
