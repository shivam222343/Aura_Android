const mongoose = require('mongoose');

const notificationSchema = new mongoose.Schema({
    userId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: [true, 'User ID is required']
    },
    type: {
        type: String,
        required: [true, 'Notification type is required'],
        enum: [
            'task_assigned',
            'task_reminder',
            'task_completed',
            'meeting_created',
            'meeting_updated',
            'meeting_cancelled',
            'meeting_reminder',
            'attendance_warning',
            'absence_approved',
            'absence_rejected',
            'role_changed',
            'club_announcement',
            'new_message',
            'member_joined',
            'member_removed',
            'attendance_marked',
            'gallery_upload',
            'gallery_approved',
            'admin_custom_notification'
        ]
    },
    title: {
        type: String,
        required: [true, 'Notification title is required']
    },
    message: {
        type: String,
        required: [true, 'Notification message is required']
    },
    data: {
        type: mongoose.Schema.Types.Mixed // Additional data specific to notification type
    },
    clubId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Club'
    },
    relatedId: {
        type: mongoose.Schema.Types.ObjectId // ID of related entity (task, meeting, etc.)
    },
    relatedModel: {
        type: String,
        enum: ['Task', 'Meeting', 'Club', 'User', 'Message', 'Gallery']
    },
    read: {
        type: Boolean,
        default: false
    },
    readAt: Date,
    priority: {
        type: String,
        enum: ['low', 'medium', 'high'],
        default: 'medium'
    },
    expiresAt: Date // Auto-delete old notifications
}, {
    timestamps: true
});

// Index for efficient queries
notificationSchema.index({ userId: 1, read: 1, createdAt: -1 });
notificationSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 }); // TTL index

// Mark notification as read
notificationSchema.methods.markAsRead = function () {
    this.read = true;
    this.readAt = new Date();
    return this.save();
};

module.exports = mongoose.model('Notification', notificationSchema);
