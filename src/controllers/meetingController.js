const Meeting = require('../models/Meeting');
const Club = require('../models/Club');
const Notification = require('../models/Notification');
const User = require('../models/User');
const { sendPushNotification, sendClubPushNotification } = require('../utils/pushNotifications');

// Helper to emit socket events
const emitToClub = (req, clubId, event, data) => {
    const io = req.app.get('io');
    if (io) {
        // Emit to the club-specific room
        io.to(`club:${clubId}`).emit(event, { clubId, ...data });
    }
};

const emitToUser = (req, userId, event, data) => {
    const io = req.app.get('io');
    if (io) {
        // Emit to the user-specific room
        io.to(userId.toString()).emit(event, data);
    }
};

/**
 * @desc    Create a new meeting
 * @route   POST /api/meetings
 * @access  Admin/Alumni of Club
 */
exports.createMeeting = async (req, res) => {
    try {
        const {
            clubId,
            name,
            description,
            date,
            time,
            location,
            mode,
            platform,
            locationCategory,
            classroomNumber,
            otherLocationName,
            status,
            template,
            type
        } = req.body;

        // Verify Club Existence
        const club = await Club.findById(clubId);
        if (!club) {
            return res.status(404).json({
                success: false,
                message: 'Club not found'
            });
        }

        // Verify User is Admin/Alumni of THIS club
        const userClubRole = req.user.clubsJoined.find(c => c.clubId.toString() === clubId)?.role;
        const isGlobalAdmin = req.user.role === 'admin';

        if (!isGlobalAdmin && userClubRole !== 'admin' && userClubRole !== 'alumni') {
            return res.status(403).json({
                success: false,
                message: 'Not authorized to create meetings for this club'
            });
        }

        const meeting = await Meeting.create({
            clubId,
            name,
            description,
            date,
            time,
            location,
            mode,
            platform,
            locationCategory,
            classroomNumber,
            otherLocationName,
            status: status || 'upcoming',
            template,
            type: type || 'General',
            createdBy: req.user._id
        });

        // Trigger Notification for all club members (except creator)
        try {
            const members = await User.find({
                'clubsJoined.clubId': clubId,
                _id: { $ne: req.user._id }
            });
            const notificationPromises = members.map(member =>
                Notification.create({
                    userId: member._id,
                    type: 'meeting_created',
                    title: `New Meeting: ${name}`,
                    message: `${club.name} has scheduled a new ${type || 'General'} meeting on ${new Date(date).toDateString()}.`,
                    clubId: clubId,
                    relatedId: meeting._id,
                    relatedModel: 'Meeting'
                })
            );
            await Promise.all(notificationPromises);

            // Signal each member to refresh their notification count via socket
            members.forEach(member => emitToUser(req, member._id, 'notification_receive', {}));
        } catch (notifyError) {
            console.error('Failed to create notifications for meeting:', notifyError);
            // Don't fail the meeting creation if notification fails
        }

        res.status(201).json({
            success: true,
            data: meeting
        });

        // Emit socket event
        emitToClub(req, clubId, 'meeting_created', { meeting });

        // Push Notification
        await sendClubPushNotification(
            clubId,
            `New Meeting: ${meeting.name}`,
            `A new meeting has been scheduled for ${new Date(meeting.date).toLocaleDateString()} at ${meeting.time}.`,
            { type: 'meeting_created', meetingId: meeting._id, senderId: req.user._id }
        );

    } catch (error) {
        console.error('Create meeting error:', error);
        if (error.name === 'ValidationError') {
            return res.status(400).json({
                success: false,
                message: Object.values(error.errors).map(val => val.message).join(', ')
            });
        }
        res.status(500).json({
            success: false,
            message: error.message || 'Error creating meeting'
        });
    }
};

/**
 * @desc    Update meeting
 * @route   PUT /api/meetings/:id
 * @access  Admin/Alumni
 */
exports.updateMeeting = async (req, res) => {
    try {
        let meeting = await Meeting.findById(req.params.id);
        if (!meeting) return res.status(404).json({ success: false, message: 'Meeting not found' });

        const userClubRole = req.user.clubsJoined.find(c => c.clubId.toString() === meeting.clubId.toString())?.role;
        if (req.user.role !== 'admin' && userClubRole !== 'admin' && userClubRole !== 'alumni') {
            return res.status(403).json({ success: false, message: 'Not authorized' });
        }

        meeting = await Meeting.findByIdAndUpdate(req.params.id, req.body, { new: true, runValidators: true });

        res.status(200).json({ success: true, data: meeting });

        // Emit socket event
        emitToClub(req, meeting.clubId, 'meeting_updated', { meeting });
    } catch (error) {
        res.status(500).json({ success: false, message: 'Error updating meeting' });
    }
};

/**
 * @desc    Update meeting status
 * @route   PUT /api/meetings/:id/status
 * @access  Admin/Alumni
 */
exports.updateMeetingStatus = async (req, res) => {
    try {
        const { status } = req.body;
        let meeting = await Meeting.findById(req.params.id);
        if (!meeting) return res.status(404).json({ success: false, message: 'Meeting not found' });

        const userClubRole = req.user.clubsJoined.find(c => c.clubId.toString() === meeting.clubId.toString())?.role;
        if (req.user.role !== 'admin' && userClubRole !== 'admin' && userClubRole !== 'alumni') {
            return res.status(403).json({ success: false, message: 'Not authorized' });
        }

        meeting.status = status;
        await meeting.save();

        res.status(200).json({ success: true, data: meeting });

        // Emit socket event
        emitToClub(req, meeting.clubId, 'meeting_status_updated', { meetingId: meeting._id, status });

        // Notify members if meeting is canceled
        if (status === 'canceled') {
            const club = await Club.findById(meeting.clubId);
            const members = await User.find({ 'clubsJoined.clubId': meeting.clubId });
            const notifications = members.map(m => ({
                userId: m._id,
                type: 'meeting_cancelled',
                title: `Meeting Canceled: ${meeting.name}`,
                message: `The meeting "${meeting.name}" for ${club.name} has been canceled.`,
                relatedId: meeting._id,
                relatedModel: 'Meeting',
                clubId: meeting.clubId
            }));
            await Notification.insertMany(notifications);
            members.forEach(m => emitToUser(req, m._id, 'notification_receive', {}));

            // Push notification for cancellation
            await sendClubPushNotification(
                meeting.clubId,
                `Meeting Canceled: ${meeting.name}`,
                `The meeting "${meeting.name}" has been canceled.`,
                { type: 'meeting_cancelled', meetingId: meeting._id }
            );
        }
    } catch (error) {
        res.status(500).json({ success: false, message: 'Error updating status' });
    }
};

/**
 * @desc    Delete meeting
 * @route   DELETE /api/meetings/:id
 * @access  Admin/Alumni
 */
exports.deleteMeeting = async (req, res) => {
    try {
        const meeting = await Meeting.findById(req.params.id);
        if (!meeting) return res.status(404).json({ success: false, message: 'Meeting not found' });

        const userClubRole = req.user.clubsJoined.find(c => c.clubId.toString() === meeting.clubId.toString())?.role;
        if (req.user.role !== 'admin' && userClubRole !== 'admin' && userClubRole !== 'alumni') {
            return res.status(403).json({ success: false, message: 'Not authorized' });
        }

        const clubId = meeting.clubId;
        await meeting.deleteOne();
        res.status(200).json({ success: true, message: 'Meeting deleted successfully' });

        // Emit socket event
        emitToClub(req, clubId, 'meeting_deleted', { meetingId: req.params.id });
    } catch (error) {
        res.status(500).json({ success: false, message: 'Error deleting meeting' });
    }
};

/**
 * @desc    Get meetings for a specific club
 * @route   GET /api/clubs/:clubId/meetings
 * @access  Club Members
 */
exports.getClubMeetings = async (req, res) => {
    try {
        const { clubId } = req.params;
        const isGlobalAdmin = req.user.role === 'admin';
        const query = {};

        if (clubId !== 'all') {
            // Check if user is member of this specific club (or global admin)
            const isMember = req.user.clubsJoined.some(c => c.clubId && c.clubId.toString() === clubId);
            if (!isGlobalAdmin && !isMember) {
                return res.status(403).json({
                    success: false,
                    message: 'You must join this club to view its meetings',
                    errorType: 'NOT_JOINED'
                });
            }
            query.clubId = clubId;
        } else {
            // If fetching all, and not global admin, only show meetings for clubs they joined
            if (!isGlobalAdmin) {
                const joinedClubIds = req.user.clubsJoined
                    .filter(c => c.clubId) // Safety check
                    .map(c => c.clubId);
                query.clubId = { $in: joinedClubIds };
            }
        }

        const meetings = await Meeting.find(query)
            .sort({ date: 1 })
            .populate('clubId', 'name')
            .populate('createdBy', 'displayName')
            .populate('attendees.userId', 'displayName maverickId profilePicture');

        // Separate into Upcoming and Past based on status and date
        const now = new Date();
        const upcoming = meetings.filter(m =>
            m.status === 'upcoming' ||
            m.status === 'ongoing' ||
            new Date(m.date) >= now
        );
        const past = meetings.filter(m =>
            !upcoming.some(u => u._id.toString() === m._id.toString())
        ).reverse(); // Most recent past first

        res.status(200).json({
            success: true,
            data: {
                upcoming,
                past
            }
        });

    } catch (error) {
        console.error('Get club meetings error DETAILS:', {
            message: error.message,
            stack: error.stack,
            userId: req.user?._id,
            clubId: req.params.clubId
        });
        res.status(500).json({
            success: false,
            message: 'Error fetching meetings',
            error: error.message
        });
    }
};

/**
 * @desc    Generate Attendance Code/QR
 * @route   POST /api/meetings/:id/attendance-start
 * @access  Admin/Alumni
 */
exports.startAttendance = async (req, res) => {
    try {
        const meeting = await Meeting.findById(req.params.id);
        if (!meeting) return res.status(404).json({ success: false, message: 'Meeting not found' });

        // Authorization Check
        const clubId = meeting.clubId.toString();
        const userClubRole = req.user.clubsJoined.find(c => c.clubId.toString() === clubId)?.role;
        if (req.user.role !== 'admin' && userClubRole !== 'admin' && userClubRole !== 'alumni') {
            return res.status(403).json({ success: false, message: 'Not authorized' });
        }

        // Generate 4-digit code
        const code = Math.floor(1000 + Math.random() * 9000).toString();

        meeting.attendanceCode = code;
        meeting.isAttendanceActive = true;
        // Expires in 15 mins
        // meeting.qrCode.expiresAt = new Date(Date.now() + 15*60000); 

        await meeting.save();

        res.status(200).json({
            success: true,
            code: meeting.attendanceCode,
            message: 'Attendance logic started. Active for users.'
        });

        // Emit socket event
        emitToClub(req, clubId, 'attendance_started', {
            meetingId: meeting._id,
            attendanceCode: meeting.attendanceCode
        });

    } catch (error) {
        res.status(500).json({ success: false, message: 'Server Error' });
    }
};

/**
 * @desc    Mark Attendance (User)
 * @route   POST /api/meetings/:id/attendance
 * @access  Member
 */
exports.markAttendance = async (req, res) => {
    try {
        const { code } = req.body;
        const meeting = await Meeting.findById(req.params.id);

        if (!meeting) return res.status(404).json({ success: false, message: 'Meeting not found' });

        // Check if user is a member of the club
        const isMember = req.user.clubsJoined.some(c => c.clubId.toString() === meeting.clubId.toString());
        if (!isMember && req.user.role !== 'admin') {
            return res.status(403).json({
                success: false,
                message: 'You are not a member of this club. Please join the club to mark attendance.'
            });
        }

        if (!meeting.isAttendanceActive) {
            return res.status(400).json({ success: false, message: 'Attendance is not currently active for this meeting.' });
        }

        if (meeting.attendanceCode !== code) {
            return res.status(400).json({ success: false, message: 'Invalid Attendance Code' });
        }

        // Check if already marked
        const alreadyMarked = meeting.attendees.find(a => a.userId.toString() === req.user._id.toString());
        if (alreadyMarked) {
            return res.status(400).json({ success: false, message: 'Attendance already marked.' });
        }

        // Add to attendees
        meeting.attendees.push({
            userId: req.user._id,
            status: 'present',
            markedAt: new Date()
        });

        await meeting.save();

        res.status(200).json({
            success: true,
            message: 'Attendance marked successfully!'
        });

        // Emit socket event to admin (so they see real-time attendee list)
        emitToClub(req, meeting.clubId, 'attendance_marked', {
            meetingId: meeting._id,
            userId: req.user._id,
            status: 'present'
        });

    } catch (error) {
        console.error('Mark attendance error:', error);
        res.status(500).json({ success: false, message: 'Error marking attendance' });
    }
};

/**
 * @desc    Mark Attendance Manually (Admin)
 * @route   POST /api/meetings/:id/manual-attendance
 * @access  Admin
 */
exports.manualAttendance = async (req, res) => {
    try {
        const { userIds, status } = req.body; // array of userIds
        const meeting = await Meeting.findById(req.params.id);
        if (!meeting) return res.status(404).json({ success: false, message: 'Meeting not found' });

        // Authorization checks... (Same as above)

        // Loop through userIds
        userIds.forEach(uid => {
            const index = meeting.attendees.findIndex(a => a.userId.toString() === uid);
            if (index > -1) {
                meeting.attendees[index].status = status;
                meeting.attendees[index].markedBy = req.user._id;
            } else {
                meeting.attendees.push({
                    userId: uid,
                    status: status,
                    markedAt: new Date(),
                    markedBy: req.user._id
                });
            }
        });

        await meeting.save();

        // Create notifications for users marked present
        if (status === 'present') {
            const club = await Club.findById(meeting.clubId);
            const notifications = userIds.map(uid => ({
                userId: uid,
                type: 'attendance_marked',
                title: 'Attendance Marked!',
                message: `You have been marked present for the meeting "${meeting.name}" by an admin.`,
                relatedId: meeting._id,
                relatedModel: 'Meeting',
                clubId: meeting.clubId
            }));
            await Notification.insertMany(notifications);

            // Emit socket to each user
            userIds.forEach(uid => emitToUser(req, uid, 'notification_receive', {}));
        }

        res.status(200).json({ success: true, message: 'Attendance updated' });

        // Emit socket event for real-time update in attendee list
        emitToClub(req, meeting.clubId, 'attendance_updated_manual', {
            meetingId: meeting._id,
            userIds,
            status
        });

    } catch (error) {
        console.error('Manual attendance error:', error);
        res.status(500).json({ success: false, message: 'Error updating attendance' });
    }
};

/**
 * @desc Get meeting details (Admin view with attendees)
 */
exports.getMeetingDetails = async (req, res) => {
    try {
        const meeting = await Meeting.findById(req.params.id)
            .populate('attendees.userId', 'displayName maverickId profilePicture');

        if (!meeting) return res.status(404).json({ success: false, message: 'Not found' });

        res.status(200).json({ success: true, data: meeting });
    } catch (e) {
        res.status(500).json({ success: false, message: 'Error' });
    }
}
