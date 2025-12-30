const mongoose = require('mongoose');

const messageSchema = new mongoose.Schema({
    senderId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: [true, 'Sender ID is required']
    },
    receiverId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User'
    },
    clubId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Club'
    },
    content: {
        type: String,
        trim: true
    },
    type: {
        type: String,
        enum: ['text', 'image', 'file', 'voice'],
        default: 'text'
    },
    fileUrl: {
        url: String,
        publicId: String,
        fileName: String,
        fileSize: Number,
        mimeType: String
    },
    read: {
        type: Boolean,
        default: false
    },
    readAt: Date,
    isGroupMessage: {
        type: Boolean,
        default: false
    },
    reactions: [{
        userId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'User'
        },
        emoji: String,
        createdAt: {
            type: Date,
            default: Date.now
        }
    }],
    replyTo: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Message'
    },
    forwarded: {
        type: Boolean,
        default: false
    },
    deleted: {
        type: Boolean,
        default: false
    },
    deletedAt: Date,
    deletedFor: [{
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User'
    }],
    isAI: {
        type: Boolean,
        default: false
    },
    mentionAI: {
        type: Boolean,
        default: false
    }
}, {
    timestamps: true
});

// Index for efficient queries
messageSchema.index({ senderId: 1, receiverId: 1, createdAt: -1 });
messageSchema.index({ clubId: 1, createdAt: -1 });
messageSchema.index({ read: 1 });

// Mark message as read
messageSchema.methods.markAsRead = function () {
    this.read = true;
    this.readAt = new Date();
    return this.save();
};

// Soft delete message
messageSchema.methods.softDelete = function () {
    this.deleted = true;
    this.deletedAt = new Date();
    return this.save();
};

module.exports = mongoose.model('Message', messageSchema);
