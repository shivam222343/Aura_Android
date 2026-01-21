const EventResource = require('../models/EventResource');
const { cloudinary } = require('../config/cloudinary');

exports.getResources = async (req, res) => {
    try {
        const { eventId } = req.params;
        const resources = await EventResource.find({ eventId })
            .populate('uploadedBy', 'name email avatar')
            .populate('clubId', 'name')
            .sort({ createdAt: -1 });

        res.json({ success: true, data: resources });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};

exports.addLink = async (req, res) => {
    try {
        const { eventId, clubId, title, url, linkType } = req.body;
        const resource = await EventResource.create({
            eventId,
            clubId,
            title,
            url,
            linkType: linkType || 'other',
            type: 'link',
            uploadedBy: req.user._id
        });
        res.status(201).json({ success: true, data: resource });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};

exports.uploadFile = async (req, res) => {
    try {
        const { eventId, clubId, title, file, type } = req.body; // file is base64

        if (!file) {
            return res.status(400).json({ success: false, message: 'No file provided' });
        }

        // Validate size (approximate from base64)
        const sizeInBytes = (file.length * 3) / 4;
        const maxSize = type === 'video' ? 50 * 1024 * 1024 : 5 * 1024 * 1024;

        if (sizeInBytes > maxSize) {
            return res.status(400).json({
                success: false,
                message: `File too large. Max size for ${type} is ${type === 'video' ? '50MB' : '5MB'}`
            });
        }

        const uploadOptions = {
            resource_type: type === 'doc' ? 'raw' : (type === 'video' ? 'video' : 'image'),
            folder: `mavericks/events/${eventId}/${type}s`
        };

        const result = await cloudinary.uploader.upload(file, uploadOptions);

        const resource = await EventResource.create({
            eventId,
            clubId,
            title,
            url: result.secure_url,
            publicId: result.public_id,
            type,
            uploadedBy: req.user._id,
            size: sizeInBytes,
            mimeType: result.format
        });

        res.status(201).json({ success: true, data: resource });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};

exports.deleteResource = async (req, res) => {
    try {
        const resource = await EventResource.findById(req.params.id);
        if (!resource) {
            return res.status(404).json({ success: false, message: 'Resource not found' });
        }

        // Only uploader or admin can delete
        if (resource.uploadedBy.toString() !== req.user._id.toString() && req.user.role !== 'admin') {
            return res.status(403).json({ success: false, message: 'Not authorized' });
        }

        if (resource.publicId) {
            const options = { resource_type: resource.type === 'doc' ? 'raw' : (resource.type === 'video' ? 'video' : 'image') };
            await cloudinary.uploader.destroy(resource.publicId, options);
        }

        await resource.deleteOne();
        res.json({ success: true, message: 'Resource deleted' });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};
exports.updateResource = async (req, res) => {
    try {
        const { title, url, linkType, clubId } = req.body;
        const resource = await EventResource.findById(req.params.id);

        if (!resource) {
            return res.status(404).json({ success: false, message: 'Resource not found' });
        }

        // Only uploader or admin can update
        if (resource.uploadedBy.toString() !== req.user._id.toString() && req.user.role !== 'admin') {
            return res.status(403).json({ success: false, message: 'Not authorized' });
        }

        if (title) resource.title = title;
        if (clubId) resource.clubId = clubId;

        // For links, also allow updating the URL and link type
        if (resource.type === 'link') {
            if (url) resource.url = url;
            if (linkType) resource.linkType = linkType;
        }

        await resource.save();

        // Populate and return
        const updatedResource = await EventResource.findById(resource._id)
            .populate('uploadedBy', 'name email avatar')
            .populate('clubId', 'name');

        res.json({ success: true, data: updatedResource });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};
