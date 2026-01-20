const Event = require('../models/Event');
const { uploadImageBuffer, deleteImage } = require('../config/cloudinary');
const { getCache, setCache, delCache } = require('../utils/cache');

/**
 * @desc    Create a new event
 * @route   POST /api/events
 * @access  Admin
 */
exports.createEvent = async (req, res) => {
    try {
        const { title, description, date, location, clubId } = req.body;

        let images = [];
        // Handle multiple image uploads (assuming base64 array for mobile compatibility)
        if (req.body.images && Array.isArray(req.body.images)) {
            for (const imgBase64 of req.body.images) {
                try {
                    const base64Data = imgBase64.includes(',') ? imgBase64.split(',')[1] : imgBase64;
                    const buffer = Buffer.from(base64Data, 'base64');
                    const result = await uploadImageBuffer(buffer, 'mavericks/events');
                    images.push(result);
                } catch (imgErr) {
                    console.error('Single image upload failed:', imgErr);
                }
            }
        }

        const event = await Event.create({
            title,
            description,
            date,
            location,
            clubId: clubId || null,
            images,
            createdBy: req.user._id
        });

        await delCache('events:all');

        res.status(201).json({
            success: true,
            data: event
        });
    } catch (error) {
        console.error('Create event error:', error);
        res.status(500).json({
            success: false,
            message: error.message || 'Error creating event'
        });
    }
};

/**
 * @desc    Get all events
 * @route   GET /api/events
 * @access  Private
 */
exports.getAllEvents = async (req, res) => {
    try {
        const cacheKey = 'events:all';
        const cachedEvents = await getCache(cacheKey);

        if (cachedEvents) {
            return res.status(200).json({
                success: true,
                data: cachedEvents,
                source: 'cache'
            });
        }

        const events = await Event.find()
            .populate('clubId', 'name logo')
            .populate('createdBy', 'displayName')
            .sort({ date: -1 });

        await setCache(cacheKey, events, 1800);

        res.status(200).json({
            success: true,
            data: events
        });
    } catch (error) {
        console.error('Get all events error:', error);
        res.status(500).json({ success: false, message: 'Error fetching events' });
    }
};

/**
 * @desc    Get single event
 * @route   GET /api/events/:id
 * @access  Private
 */
exports.getEventById = async (req, res) => {
    try {
        const event = await Event.findById(req.params.id)
            .populate('clubId', 'name logo')
            .populate('createdBy', 'displayName');

        if (!event) {
            return res.status(404).json({ success: false, message: 'Event not found' });
        }

        res.status(200).json({
            success: true,
            data: event
        });
    } catch (error) {
        res.status(500).json({ success: false, message: 'Error fetching event' });
    }
};

/**
 * @desc    Delete event
 * @route   DELETE /api/events/:id
 * @access  Admin
 */
exports.deleteEvent = async (req, res) => {
    try {
        const event = await Event.findById(req.params.id);
        if (!event) return res.status(404).json({ success: false, message: 'Event not found' });

        // Delete images from Cloudinary
        for (const img of event.images) {
            if (img.publicId) {
                try {
                    await deleteImage(img.publicId);
                } catch (delErr) {
                    console.error('Cloudinary delete failed for image:', img.publicId);
                }
            }
        }

        await event.deleteOne();
        await delCache('events:all');

        res.status(200).json({ success: true, message: 'Event deleted successfully' });
    } catch (error) {
        console.error('Delete event error:', error);
        res.status(500).json({ success: false, message: 'Error deleting event' });
    }
};
