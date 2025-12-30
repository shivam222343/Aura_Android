const mongoose = require('mongoose');

const meetingSchema = new mongoose.Schema({
    clubId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Club',
        required: [true, 'Club ID is required']
    },
    name: {
        type: String,
        required: [true, 'Meeting name is required'],
        trim: true
    },
    description: {
        type: String,
        trim: true
    },
    date: {
        type: Date,
        required: [true, 'Meeting date is required']
    },
    time: {
        type: String,
        required: [true, 'Meeting time is required']
    },
    location: {
        type: String,
        trim: true
    },
    mode: {
        type: String,
        enum: ['Online', 'Offline'],
        default: 'Offline'
    },
    platform: {
        type: String,
        enum: ['Zoom', 'Google Meet', 'Discord', 'Other'],
        required: function () { return this.mode === 'Online'; }
    },
    locationCategory: {
        type: String,
        enum: ['South Enclave', 'OAT', 'Classroom', 'Food Court', 'Library', 'North Enclave', 'Other'],
        required: function () { return this.mode === 'Offline'; }
    },
    classroomNumber: String,
    otherLocationName: String,
    template: String,
    type: {
        type: String,
        enum: ['General', 'Technical', 'Workshop', 'Social', 'Emergency'],
        default: 'General'
    },
    status: {
        type: String,
        enum: ['upcoming', 'ongoing', 'completed', 'canceled', 'cancelled'],
        default: 'upcoming'
    },
    attendees: [{
        userId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'User'
        },
        status: {
            type: String,
            enum: ['present', 'absent', 'late'],
            default: 'absent'
        },
        markedAt: Date,
        markedBy: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'User'
        }
    }],
    absenceRequests: [{
        userId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'User'
        },
        reason: {
            type: String,
            required: true
        },
        status: {
            type: String,
            enum: ['pending', 'approved', 'rejected'],
            default: 'pending'
        },
        reviewedBy: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'User'
        },
        reviewedAt: Date,
        submittedAt: {
            type: Date,
            default: Date.now
        }
    }],
    attendanceMarked: {
        type: Boolean,
        default: false
    },
    agenda: [{
        title: String,
        description: String,
        order: Number
    }],
    notes: {
        type: String
    },
    qrCode: {
        data: String,
        expiresAt: Date
    },
    attendanceCode: {
        type: String,
        trim: true
    },
    isAttendanceActive: {
        type: Boolean,
        default: false
    },
    createdBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true
    },
    isRecurring: {
        type: Boolean,
        default: false
    },
    recurringPattern: {
        frequency: {
            type: String,
            enum: ['daily', 'weekly', 'monthly']
        },
        interval: Number,
        endDate: Date
    }
}, {
    timestamps: true
});

// Index for efficient queries
meetingSchema.index({ clubId: 1, date: -1 });
meetingSchema.index({ status: 1 });

// Calculate attendance rate
meetingSchema.methods.getAttendanceRate = function () {
    if (this.attendees.length === 0) return 0;
    const presentCount = this.attendees.filter(a => a.status === 'present').length;
    return (presentCount / this.attendees.length) * 100;
};

module.exports = mongoose.model('Meeting', meetingSchema);
