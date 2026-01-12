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
    isPublic: {
        type: Boolean,
        default: false
    },
    styles: {
        fontSize: { type: Number, default: 16 },
        fontFamily: { type: String, default: 'System' },
        color: { type: String, default: '#000000' },
        isBold: { type: Boolean, default: false },
        isItalic: { type: Boolean, default: false },
        isUnderline: { type: Boolean, default: false },
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
