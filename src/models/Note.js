const mongoose = require('mongoose');

const noteSchema = new mongoose.Schema({
    userId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true
    },
    clubId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Club'
    },
    title: {
        type: String,
        required: true,
        trim: true
    },
    content: {
        type: String,
        default: ''
    },
    contentDelta: {
        type: Object, // Stores Quill-style Deltas or structured block data
        default: { ops: [{ insert: '\n' }] }
    },
    isPublic: {
        type: Boolean,
        default: false
    },
    history: [{
        user: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
        op: Object,
        timestamp: { type: Date, default: Date.now }
    }],
    styles: {
        fontSize: { type: Number, default: 16 },
        fontFamily: { type: String, default: 'System' },
        lineHeight: { type: Number, default: 1.5 },
        color: { type: String, default: '#1F2937' },
        textAlign: { type: String, default: 'left' }
    },
    collaborators: [{
        userId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'User'
        },
        cursor: {
            x: Number,
            y: Number
        },
        lastActive: {
            type: Date,
            default: Date.now
        }
    }],
    lastModifiedBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User'
    }
}, {
    timestamps: true
});

noteSchema.index({ clubId: 1, isPublic: 1 });
noteSchema.index({ userId: 1 });

module.exports = mongoose.model('Note', noteSchema);
