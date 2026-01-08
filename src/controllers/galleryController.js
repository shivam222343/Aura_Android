const mongoose = require('mongoose');
const Gallery = require('../models/Gallery');
const Club = require('../models/Club');
const User = require('../models/User');
const Notification = require('../models/Notification');
const { sendPushNotification, sendPushNotificationToMany } = require('../utils/notifications');
const { uploadImageBuffer: uploadToCloudinary } = require('../config/cloudinary');

/**
 * @desc    Upload image to gallery
 * @route   POST /api/gallery
 * @access  Private (Club Members)
 */
exports.uploadImage = async (req, res) => {
    try {
        console.log('Incoming Gallery Upload:', {
            body: req.body,
            file: req.file ? {
                fieldname: req.file.fieldname,
                originalname: req.file.originalname,
                mimetype: req.file.mimetype,
                size: req.file.size
            } : 'No file'
        });

        const { title, description, clubId, category, tags, imageUrl, publicId } = req.body;

        if (!req.file && !imageUrl) {
            return res.status(400).json({ success: false, message: 'Please upload an image or provide a URL' });
        }

        // Validate clubId if provided (ensure it's not "null" or empty string)
        const validClubId = clubId && mongoose.Types.ObjectId.isValid(clubId) ? clubId : undefined;

        let finalImageUrl = imageUrl;
        let finalPublicId = publicId;

        if (req.file) {
            // Upload to Cloudinary using buffer
            const result = await uploadToCloudinary(req.file.buffer, 'gallery');
            finalImageUrl = result.url;
            finalPublicId = result.publicId;
        }

        const newImage = await Gallery.create({
            imageUrl: finalImageUrl,
            publicId: finalPublicId,
            title,
            description,
            uploadedBy: req.user._id,
            clubId: validClubId,
            category: category || 'other',
            tags: tags ? JSON.parse(tags) : [],
            status: 'pending' // Require admin approval
        });

        res.status(201).json({
            success: true,
            data: newImage,
            message: 'Image uploaded successfully.'
        });

        // Notify Admins
        try {
            const admins = await User.find({ role: 'admin' }).select('_id');
            const adminIds = admins.map(a => a._id);

            if (adminIds.length > 0) {
                const adminNotifs = adminIds.map(adminId => ({
                    userId: adminId,
                    type: 'gallery_upload',
                    title: 'New Gallery Upload',
                    message: `${req.user.displayName} uploaded a new image for approval.`,
                    relatedId: newImage._id,
                    relatedModel: 'Gallery'
                }));
                await Notification.insertMany(adminNotifs);
                await sendPushNotificationToMany(adminIds, {
                    title: 'New Gallery Upload 📸',
                    body: `${req.user.displayName} just uploaded a new image. Check it for approval!`,
                    data: { imageId: newImage._id.toString() }
                });
            }
        } catch (notifError) {
            console.error('Error sending admin notifications:', notifError);
        }
    } catch (error) {
        console.error('Gallery upload error:', error);
        res.status(400).json({
            success: false,
            message: error.message || 'Failed to upload image'
        });
    }
};

/**
 * @desc    Upload image using base64 (for Android compatibility)
 * @route   POST /api/gallery/upload-base64
 * @access  Private (Club Members)
 */
exports.uploadBase64Image = async (req, res) => {
    try {
        console.log('Incoming Base64 Gallery Upload');

        const { image, title, description, clubId, category, tags } = req.body;

        if (!image) {
            return res.status(400).json({ success: false, message: 'Please provide an image' });
        }

        // Validate clubId if provided
        const validClubId = clubId && mongoose.Types.ObjectId.isValid(clubId) ? clubId : undefined;

        // Upload base64 to Cloudinary
        const result = await uploadToCloudinary(Buffer.from(image.split(',')[1], 'base64'), 'gallery');

        const newImage = await Gallery.create({
            imageUrl: result.url,
            publicId: result.publicId,
            title,
            description,
            uploadedBy: req.user._id,
            clubId: validClubId,
            category: category || 'other',
            tags: tags || [],
            status: 'pending' // Require admin approval
        });

        res.status(201).json({
            success: true,
            data: newImage,
            message: 'Image uploaded successfully.'
        });

        // Notify Admins
        try {
            const admins = await User.find({ role: 'admin' }).select('_id');
            const adminIds = admins.map(a => a._id);

            if (adminIds.length > 0) {
                const adminNotifs = adminIds.map(adminId => ({
                    userId: adminId,
                    type: 'gallery_upload',
                    title: 'New Gallery Upload',
                    message: `${req.user.displayName} uploaded a new image for approval.`,
                    relatedId: newImage._id,
                    relatedModel: 'Gallery'
                }));
                await Notification.insertMany(adminNotifs);
                await sendPushNotificationToMany(adminIds, {
                    title: 'New Gallery Upload 📸',
                    body: `${req.user.displayName} just uploaded a new image. Check it for approval!`,
                    data: { imageId: newImage._id.toString() }
                });
            }
        } catch (notifError) {
            console.error('Error sending admin notifications:', notifError);
        }
    } catch (error) {
        console.error('Base64 Gallery upload error:', error);
        res.status(400).json({
            success: false,
            message: error.message || 'Failed to upload image'
        });
    }
};

/**
 * @desc    Get all approved gallery images
 * @route   GET /api/gallery
 * @access  Public
 */
exports.getGalleryImages = async (req, res) => {
    try {
        const { category, clubId, status } = req.query;
        let query = { status: 'approved' };

        // If status is provided and user is admin, allow filtering by status
        if (status && (req.user?.role === 'admin' || req.user?.role === 'subadmin')) {
            query.status = status;
        }

        if (category && category !== 'all') query.category = category;
        if (clubId) query.clubId = clubId;

        const images = await Gallery.find(query)
            .populate('uploadedBy', 'displayName profilePicture')
            .populate('comments.user', 'displayName profilePicture')
            .populate('clubId', 'name')
            .sort({ createdAt: -1 });

        res.status(200).json({
            success: true,
            data: images
        });
    } catch (error) {
        res.status(500).json({ success: false, message: 'Server error' });
    }
};

/**
 * @desc    Approve/Reject gallery image
 * @route   PUT /api/gallery/:id/status
 * @access  Private (Admin)
 */
exports.updateImageStatus = async (req, res) => {
    try {
        const { status } = req.body; // 'approved' or 'rejected'
        const image = await Gallery.findById(req.params.id);

        if (!image) {
            return res.status(404).json({ success: false, message: 'Image not found' });
        }

        image.status = status;
        image.approvedBy = req.user._id;
        await image.save();

        res.status(200).json({
            success: true,
            data: image
        });

        // If approved, notify all users
        if (status === 'approved') {
            try {
                // Find all users with push tokens
                const users = await User.find({ _id: { $ne: image.uploadedBy } }).select('_id');
                const userIds = users.map(u => u._id);

                if (userIds.length > 0) {
                    // We don't want to flood the Notification collection with thousands of "New Gallery Item" for every user
                    // maybe just push notification? Or maybe just for active users?
                    // User requested "show new img notification to all users".
                    // I'll do push only for everyone, and DB notif only for the uploader (to say your image is live)

                    // Notify uploader
                    const uploaderNotif = await Notification.create({
                        userId: image.uploadedBy,
                        type: 'gallery_approved',
                        title: 'Image Approved! 🎉',
                        message: `Your image "${image.title || 'Untitled'}" is now live in the gallery.`,
                        relatedId: image._id,
                        relatedModel: 'Gallery'
                    });
                    await sendPushNotification(image.uploadedBy, {
                        title: 'Image Approved! 🎉',
                        body: `Your image is now live in the gallery.`,
                        data: { imageId: image._id.toString() }
                    });

                    // Broad push notification to others
                    await sendPushNotificationToMany(userIds, {
                        title: 'New Gallery Photo 📸',
                        body: 'Someone just shared a new moment in the gallery. Check it out!',
                        data: { imageId: image._id.toString() }
                    });
                }
            } catch (notifError) {
                console.error('Error sending approval notifications:', notifError);
            }
        }
    } catch (error) {
        res.status(500).json({ success: false, message: 'Server error' });
    }
};

/**
 * @desc    Toggle like on image
 * @route   POST /api/gallery/:id/like
 * @access  Private
 */
exports.toggleLike = async (req, res) => {
    try {
        const image = await Gallery.findById(req.params.id);
        if (!image) return res.status(404).json({ success: false, message: 'Image not found' });

        const likeIndex = image.likes.indexOf(req.user._id);
        if (likeIndex > -1) {
            image.likes.splice(likeIndex, 1);
        } else {
            image.likes.push(req.user._id);
        }

        await image.save();

        // Emit Socket Event
        const io = req.app.get('io');
        if (io) {
            io.emit('gallery:like', {
                imageId: image._id,
                likes: image.likes,
                userId: req.user._id
            });
        }

        res.status(200).json({
            success: true,
            likes: image.likes
        });
    } catch (error) {
        res.status(500).json({ success: false, message: 'Server error' });
    }
};

/**
 * @desc    Add comment
 * @route   POST /api/gallery/:id/comment
 * @access  Private
 */
exports.addComment = async (req, res) => {
    try {
        const { text } = req.body;
        const image = await Gallery.findById(req.params.id);

        if (!image) return res.status(404).json({ success: false, message: 'Image not found' });

        const comment = {
            user: req.user._id,
            text
        };

        image.comments.push(comment);
        await image.save();

        const populatedImage = await Gallery.findById(image._id)
            .populate('comments.user', 'displayName profilePicture');

        const newComment = populatedImage.comments[populatedImage.comments.length - 1];

        // Emit Socket Event
        const io = req.app.get('io');
        if (io) {
            io.emit('gallery:comment', {
                imageId: image._id,
                comment: newComment
            });
        }

        res.status(201).json({
            success: true,
            data: newComment
        });
    } catch (error) {
        res.status(500).json({ success: false, message: 'Server error' });
    }
};

/**
 * @desc    Get liked users list
 * @route   GET /api/gallery/:id/likes
 * @access  Private
 */
exports.getLikedUsers = async (req, res) => {
    try {
        const image = await Gallery.findById(req.params.id).populate('likes', 'displayName profilePicture');
        if (!image) return res.status(404).json({ success: false, message: 'Image not found' });

        res.status(200).json({
            success: true,
            data: image.likes
        });
    } catch (error) {
        res.status(500).json({ success: false, message: 'Server error' });
    }
};

/**
 * @desc    Update image details (title, description, category)
 * @route   PUT /api/gallery/:id
 * @access  Private
 */
exports.updateImage = async (req, res) => {
    try {
        let image = await Gallery.findById(req.params.id);
        if (!image) return res.status(404).json({ success: false, message: 'Image not found' });

        // Check ownership or admin
        if (image.uploadedBy.toString() !== req.user._id.toString() && req.user.role !== 'admin') {
            return res.status(403).json({ success: false, message: 'Not authorized to update this image' });
        }

        const { title, description, category, clubId } = req.body;

        image.title = title || image.title;
        image.description = description || image.description;
        image.category = category || image.category;
        image.clubId = clubId || image.clubId;

        await image.save();

        res.status(200).json({ success: true, data: image });
    } catch (error) {
        res.status(500).json({ success: false, message: 'Server error' });
    }
};

/**
 * @desc    Delete image
 * @route   DELETE /api/gallery/:id
 * @access  Private
 */
exports.deleteImage = async (req, res) => {
    try {
        const image = await Gallery.findById(req.params.id);
        if (!image) return res.status(404).json({ success: false, message: 'Image not found' });

        // Check ownership or admin
        if (image.uploadedBy.toString() !== req.user._id.toString() && req.user.role !== 'admin') {
            return res.status(403).json({ success: false, message: 'Not authorized to delete this image' });
        }

        // Delete from Cloudinary if publicId exists
        if (image.publicId) {
            const cloudinary = require('cloudinary').v2;
            await cloudinary.uploader.destroy(image.publicId);
        }

        await image.deleteOne();

        res.status(200).json({ success: true, message: 'Image removed' });
    } catch (error) {
        console.error('Delete image error:', error);
        res.status(500).json({ success: false, message: 'Server error' });
    }
};
