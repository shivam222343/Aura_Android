const mongoose = require('mongoose');

const EventResourceSchema = new mongoose.Schema({
    eventId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Event',
        required: true
    },
    clubId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Club',
        required: true
    },
    type: {
        type: String,
        enum: ['link', 'image', 'video', 'doc'],
        required: true
    },
    title: {
        type: String,
        required: true,
        trim: true
    },
    url: {
        type: String,
        required: true
    },
    publicId: {
        type: String, // For Cloudinary images/videos/docs
    },
    mimeType: {
        type: String, // e.g., image/jpeg, application/pdf
    },
    uploadedBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true
    },
    size: {
        type: Number, // In bytes
    }
}, {
    timestamps: true
});

module.exports = mongoose.model('EventResource', EventResourceSchema);
