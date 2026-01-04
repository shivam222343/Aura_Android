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
                recipientsList = JSON.parse(recipients);
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
            // If specific recipients, we might want to emit only to them, but filtering in room is harder.
            // Client side filtering is also an option, but for privacy, backend should control data.
            // For now, emit to club, but client should check visibility (or we assume "snap:new" is a generic alert).
            // Better: emit to specific users if targeted.
            if (recipientsList && recipientsList.length > 0) {
                recipientsList.forEach(recipientId => {
                    io.to(recipientId.toString()).emit('snap:new', populatedSnap);
                });
                // Also emit to sender so they see it
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
                // Get all club members
                const club = await require('../models/Club').findById(clubId).populate('members.userId');
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

        // Format viewers list with time
        const viewers = snap.viewedBy.map(v => ({
            _id: v.userId._id,
            displayName: v.userId.displayName,
            profilePicture: v.userId.profilePicture,
            viewedAt: v.viewedAt
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
