const mongoose = require('mongoose');

const snapSchema = new mongoose.Schema({
    senderId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true
    },
    clubId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Club',
        required: true
    },
    mediaUrl: {
        url: { type: String, required: true },
        publicId: { type: String, required: true }
    },
    type: {
        type: String,
        enum: ['image', 'video'],
        default: 'image'
    },
    viewedBy: [{
        userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
        viewedAt: { type: Date, default: Date.now }
    }],
    recipients: [{
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User'
    }], // If empty, visible to all club members
    caption: String,
    deleted: {
        type: Boolean,
        default: false
    },
    expiresAt: {
        type: Date,
        required: true,
        index: true
    }
}, {
    timestamps: true
});

// TTL index to automatically remove expired snaps
// Note: expiresAt is the direct expiration date
snapSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

module.exports = mongoose.model('Snap', snapSchema);
