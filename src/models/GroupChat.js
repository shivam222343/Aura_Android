const mongoose = require('mongoose');

const groupMessageSchema = new mongoose.Schema({
    senderId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true
    },
    content: {
        type: String,
        trim: true
    },
    type: {
        type: String,
        enum: ['text', 'image', 'video', 'document', 'media', 'file'],
        default: 'text'
    },
    fileUrl: {
        url: String,
        publicId: String,
        fileName: String,
        fileSize: Number,
        mimeType: String
    },
    replyTo: {
        type: mongoose.Schema.Types.ObjectId
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
    readBy: [{
        userId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'User'
        },
        readAt: {
            type: Date,
            default: Date.now
        }
    }],
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
    createdAt: {
        type: Date,
        default: Date.now
    }
});

const groupChatSchema = new mongoose.Schema({
    clubId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Club',
        required: true,
        unique: true
    },
    name: String,
    description: String,
    members: [{
        userId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'User'
        },
        role: {
            type: String,
            default: 'member'
        }
    }],
    messages: [groupMessageSchema],
    lastMessage: {
        senderId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'User'
        },
        content: String,
        createdAt: Date
    }
}, {
    timestamps: true
});

// Index for efficient lookups
groupChatSchema.index({ clubId: 1 });

module.exports = mongoose.model('GroupChat', groupChatSchema);
