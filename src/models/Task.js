const mongoose = require('mongoose');

const taskSchema = new mongoose.Schema({
    meetingId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Meeting'
    },
    clubId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Club',
        required: [true, 'Club ID is required']
    },
    title: {
        type: String,
        required: [true, 'Task title is required'],
        trim: true
    },
    description: {
        type: String,
        trim: true
    },
    assignedTo: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: [true, 'Assigned user is required']
    },
    assignedBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: [true, 'Assigner is required']
    },
    dueDate: {
        type: Date,
        required: [true, 'Due date is required']
    },
    status: {
        type: String,
        enum: ['pending', 'in-progress', 'completed', 'overdue'],
        default: 'pending'
    },
    priority: {
        type: String,
        enum: ['low', 'medium', 'high', 'urgent'],
        default: 'medium'
    },
    reminders: [{
        time: {
            type: Date,
            required: true
        },
        type: {
            type: String,
            enum: ['1day', '10hours', '5hours', '2hours'],
            required: true
        },
        sent: {
            type: Boolean,
            default: false
        },
        sentAt: Date
    }],
    completedAt: Date,
    attachments: [{
        url: String,
        publicId: String,
        fileName: String,
        fileType: String
    }],
    comments: [{
        userId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'User'
        },
        text: String,
        createdAt: {
            type: Date,
            default: Date.now
        }
    }]
}, {
    timestamps: true
});

// Index for efficient queries
taskSchema.index({ assignedTo: 1, status: 1 });
taskSchema.index({ dueDate: 1 });
taskSchema.index({ clubId: 1 });

// Automatically set reminders when task is created
taskSchema.pre('save', function (next) {
    if (this.isNew && this.dueDate) {
        const dueDate = new Date(this.dueDate);

        this.reminders = [
            {
                time: new Date(dueDate.getTime() - 24 * 60 * 60 * 1000), // 1 day before
                type: '1day',
                sent: false
            },
            {
                time: new Date(dueDate.getTime() - 10 * 60 * 60 * 1000), // 10 hours before
                type: '10hours',
                sent: false
            },
            {
                time: new Date(dueDate.getTime() - 5 * 60 * 60 * 1000), // 5 hours before
                type: '5hours',
                sent: false
            },
            {
                time: new Date(dueDate.getTime() - 2 * 60 * 60 * 1000), // 2 hours before
                type: '2hours',
                sent: false
            }
        ];
    }
    next();
});

// Check if task is overdue
taskSchema.methods.checkOverdue = function () {
    if (this.status !== 'completed' && new Date() > this.dueDate) {
        this.status = 'overdue';
        return true;
    }
    return false;
};

module.exports = mongoose.model('Task', taskSchema);
