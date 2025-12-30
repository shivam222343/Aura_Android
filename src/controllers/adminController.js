const User = require('../models/User');
const Club = require('../models/Club');
const Meeting = require('../models/Meeting');

/**
 * @desc    Get system stats
 * @route   GET /api/admin/stats
 * @access  Admin
 */
exports.getStats = async (req, res) => {
    try {
        const totalUsers = await User.countDocuments();
        const totalClubs = await Club.countDocuments();
        const totalMeetings = await Meeting.countDocuments();
        const onlineUsers = await User.countDocuments({ isOnline: true });

        // Get recent registrations (last 30 days)
        const thirtyDaysAgo = new Date();
        thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

        const newUsers = await User.countDocuments({
            createdAt: { $gte: thirtyDaysAgo }
        });

        res.status(200).json({
            success: true,
            data: {
                totalUsers,
                totalClubs,
                totalMeetings,
                onlineUsers,
                newUsers
            }
        });
    } catch (error) {
        console.error('Get stats error:', error);
        res.status(500).json({
            success: false,
            message: 'Error fetching stats'
        });
    }
};

/**
 * @desc    Get all users
 * @route   GET /api/admin/users
 * @access  Admin
 */
exports.getAllUsers = async (req, res) => {
    try {
        const users = await User.find()
            .select('-password')
            .sort('-createdAt');

        res.status(200).json({
            success: true,
            count: users.length,
            data: users
        });
    } catch (error) {
        console.error('Get users error:', error);
        res.status(500).json({
            success: false,
            message: 'Error fetching users'
        });
    }
};

/**
 * @desc    Change user role
 * @route   PUT /api/admin/users/:id/role
 * @access  Admin
 */
exports.changeUserRole = async (req, res) => {
    try {
        const { role } = req.body;
        const ValidRoles = ['member', 'alumni', 'admin', 'user'];

        if (!ValidRoles.includes(role)) {
            return res.status(400).json({
                success: false,
                message: 'Invalid role'
            });
        }

        const user = await User.findByIdAndUpdate(
            req.params.id,
            { role },
            { new: true, runValidators: true }
        ).select('-password');

        if (!user) {
            return res.status(404).json({
                success: false,
                message: 'User not found'
            });
        }

        res.status(200).json({
            success: true,
            message: `User role updated to ${role}`,
            data: user
        });
    } catch (error) {
        console.error('Change role error:', error);
        res.status(500).json({
            success: false,
            message: 'Error updating user role'
        });
    }
};
