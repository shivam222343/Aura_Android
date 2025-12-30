const Gallery = require('../models/Gallery');
const Club = require('../models/Club');
const { uploadImageBuffer: uploadToCloudinary } = require('../config/cloudinary');

/**
 * @desc    Upload image to gallery
 * @route   POST /api/gallery
 * @access  Private (Club Members)
 */
exports.uploadImage = async (req, res) => {
    try {
        const { title, description, clubId, category, tags } = req.body;

        if (!req.file) {
            return res.status(400).json({ success: false, message: 'Please upload an image' });
        }

        // Validate clubId if provided (ensure it's not "null" or empty string)
        const validClubId = clubId && mongoose.Types.ObjectId.isValid(clubId) ? clubId : undefined;

        // Upload to Cloudinary using buffer
        const result = await uploadToCloudinary(req.file.buffer, 'gallery');

        const newImage = await Gallery.create({
            imageUrl: result.url,
            publicId: result.publicId,
            title,
            description,
            uploadedBy: req.user._id,
            clubId: validClubId,
            category: category || 'other',
            tags: tags ? JSON.parse(tags) : [],
            status: 'pending' // Always pending until admin approves
        });

        res.status(201).json({
            success: true,
            data: newImage,
            message: 'Image uploaded successfully. Waiting for admin approval.'
        });
    } catch (error) {
        console.error('Gallery upload error:', error);
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
        const { category, clubId } = req.query;
        let query = { status: 'approved' };

        if (category && category !== 'all') query.category = category;
        if (clubId) query.clubId = clubId;

        const images = await Gallery.find(query)
            .populate('uploadedBy', 'displayName profilePicture')
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
