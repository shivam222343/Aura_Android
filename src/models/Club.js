const mongoose = require('mongoose');

const clubSchema = new mongoose.Schema({
    name: {
        type: String,
        required: [true, 'Club name is required'],
        unique: true,
        trim: true
    },
    description: {
        type: String,
        trim: true
    },
    logo: {
        url: String,
        publicId: String
    },
    coverImage: {
        url: String,
        publicId: String
    },
    createdBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true
    },
    admins: [{
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User'
    }],
    alumni: [{
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User'
    }],
    members: [{
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User'
    }],
    memberCount: {
        type: Number,
        default: 0
    },
    accessKeys: [{
        key: {
            type: String,
            required: true
        },
        expiresAt: Date,
        maxUses: {
            type: Number,
            default: null // null means unlimited
        },
        usedCount: {
            type: Number,
            default: 0
        },
        isActive: {
            type: Boolean,
            default: true
        },
        createdBy: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'User'
        },
        createdAt: {
            type: Date,
            default: Date.now
        }
    }],
    settings: {
        attendanceWarningThreshold: {
            type: Number,
            default: 3 // Warn after 3 consecutive absences
        },
        allowMemberInvites: {
            type: Boolean,
            default: false
        },
        requireAbsenceApproval: {
            type: Boolean,
            default: true
        }
    },
    stats: {
        totalMeetings: {
            type: Number,
            default: 0
        },
        averageAttendance: {
            type: Number,
            default: 0
        }
    },
    isActive: {
        type: Boolean,
        default: true
    }
}, {
    timestamps: true
});

// Update member count before saving
clubSchema.pre('save', function (next) {
    this.memberCount = this.members.length + this.admins.length + this.alumni.length;
    next();
});

module.exports = mongoose.model('Club', clubSchema);
