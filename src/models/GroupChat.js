const mongoose = require('mongoose');

const groupChatSchema = new mongoose.Schema({
    clubId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Club',
        required: true,
        index: true
    },
    name: {
        type: String,
        required: true
    },
    description: String,
    groupIcon: {
        url: String,
        publicId: String
    },
    members: [{
        userId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'User'
        },
        role: {
            type: String,
            enum: ['admin', 'member'],
            default: 'member'
        },
        joinedAt: {
            type: Date,
            default: Date.now
        }
    }],
    messages: [{
        senderId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'User',
            required: true
        },
        content: String,
        type: {
            type: String,
            enum: ['text', 'image', 'video', 'file'],
            default: 'text'
        },
        fileUrl: String,
        fileName: String,
        fileSize: Number,
        replyTo: {
            type: mongoose.Schema.Types.ObjectId
        },
        reactions: [{
            userId: {
                type: mongoose.Schema.Types.ObjectId,
                ref: 'User'
            },
            emoji: String
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
        deletedFor: [{
            type: mongoose.Schema.Types.ObjectId,
            ref: 'User'
        }],
        createdAt: {
            type: Date,
            default: Date.now
        }
    }],
    lastMessage: {
        content: String,
        senderId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'User'
        },
        createdAt: Date
    },
    isActive: {
        type: Boolean,
        default: true
    }
}, {
    timestamps: true
});

// Index for faster queries
groupChatSchema.index({ clubId: 1, isActive: 1 });
groupChatSchema.index({ 'members.userId': 1 });

module.exports = mongoose.model('GroupChat', groupChatSchema);
