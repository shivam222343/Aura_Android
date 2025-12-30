const mongoose = require('mongoose');

const gallerySchema = new mongoose.Schema({
    clubId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Club',
        required: [true, 'Club ID is required']
    },
    title: {
        type: String,
        trim: true
    },
    description: {
        type: String,
        trim: true
    },
    images: [{
        url: {
            type: String,
            required: true
        },
        publicId: {
            type: String,
            required: true
        },
        caption: String,
        uploadedBy: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'User'
        },
        uploadedAt: {
            type: Date,
            default: Date.now
        }
    }],
    category: {
        type: String,
        enum: ['event', 'meeting', 'workshop', 'social', 'achievement', 'other'],
        default: 'other'
    },
    eventDate: Date,
    tags: [String],
    isPublic: {
        type: Boolean,
        default: true
    },
    createdBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true
    }
}, {
    timestamps: true
});

// Index for efficient queries
gallerySchema.index({ clubId: 1, createdAt: -1 });
gallerySchema.index({ category: 1 });
gallerySchema.index({ tags: 1 });

module.exports = mongoose.model('Gallery', gallerySchema);
