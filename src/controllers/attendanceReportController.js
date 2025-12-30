const Meeting = require('../models/Meeting');
const User = require('../models/User');
const Club = require('../models/Club');

// Get club attendance report
exports.getClubAttendanceReport = async (req, res) => {
    try {
        const { clubId } = req.params;
        const { months } = req.query;

        // Verify user is admin
        if (req.user.role !== 'admin') {
            return res.status(403).json({
                success: false,
                message: 'Access denied. Admin only.'
            });
        }

        // Build meeting query
        let meetingQuery = { clubId };
        if (months && !isNaN(months)) {
            const startDate = new Date();
            startDate.setMonth(startDate.getMonth() - parseInt(months));
            meetingQuery.date = { $gte: startDate };
        }

        // Get meetings for the club with optional date filter
        const meetings = await Meeting.find(meetingQuery)
            .populate('attendees.userId', 'displayName email maverickId')
            .sort({ date: -1 })
            .lean();

        // Get all members of the club
        const club = await Club.findById(clubId).populate('members', 'displayName email maverickId').lean();

        if (!club) {
            return res.status(404).json({
                success: false,
                message: 'Club not found'
            });
        }

        // Get member details
        const memberIds = club.members.map(m => m._id || m);
        const members = await User.find({ _id: { $in: memberIds } })
            .select('displayName email maverickId')
            .lean();

        res.status(200).json({
            success: true,
            data: {
                clubName: club.name,
                meetings: meetings.map(m => ({
                    _id: m._id,
                    name: m.name,
                    date: m.date,
                    time: m.time,
                    status: m.status,
                    attendees: m.attendees || []
                })),
                members: members
            }
        });
    } catch (error) {
        console.error('Error fetching attendance report:', error);
        res.status(500).json({
            success: false,
            message: 'Error fetching attendance report',
            error: error.message
        });
    }
};
