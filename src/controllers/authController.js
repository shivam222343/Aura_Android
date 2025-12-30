const jwt = require('jsonwebtoken');
const User = require('../models/User');
const Club = require('../models/Club');
const Meeting = require('../models/Meeting');
const Task = require('../models/Task');
const { uploadImage, uploadImageBuffer } = require('../config/cloudinary');

/**
 * Generate JWT Token
 */
const generateToken = (id) => {
    return jwt.sign({ id }, process.env.JWT_SECRET, {
        expiresIn: process.env.JWT_EXPIRE || '7d'
    });
};

/**
 * @desc    Register new user
 * @route   POST /api/auth/signup
 * @access  Public
 */
exports.signup = async (req, res) => {
    try {
        const { email, password, displayName, phoneNumber } = req.body;

        // Check if user already exists
        const existingUser = await User.findOne({ email });
        if (existingUser) {
            return res.status(400).json({
                success: false,
                message: 'User with this email already exists'
            });
        }

        // Create user
        const user = await User.create({
            email,
            password,
            displayName,
            phoneNumber,
            role: email.includes('admin') ? 'admin' : 'member'
        });

        // Generate token
        const token = generateToken(user._id);

        res.status(201).json({
            success: true,
            message: 'User registered successfully',
            data: {
                user: user.getPublicProfile(),
                token
            }
        });
    } catch (error) {
        console.error('Signup error:', error);
        res.status(500).json({
            success: false,
            message: error.message || 'Error creating user'
        });
    }
};

/**
 * @desc    Login user
 * @route   POST /api/auth/signin
 * @access  Public
 */
exports.signin = async (req, res) => {
    try {
        const { email, password } = req.body;

        // Validate input
        if (!email || !password) {
            return res.status(400).json({
                success: false,
                message: 'Please provide email and password'
            });
        }

        // Check for user (include password for comparison)
        const user = await User.findOne({ email }).select('+password');
        if (!user) {
            return res.status(401).json({
                success: false,
                message: 'Invalid credentials'
            });
        }

        // Check password
        const isPasswordMatch = await user.comparePassword(password);
        if (!isPasswordMatch) {
            return res.status(401).json({
                success: false,
                message: 'Invalid credentials'
            });
        }

        // Update online status
        user.isOnline = true;
        user.lastSeen = new Date();
        await user.save();

        // Generate token
        const token = generateToken(user._id);

        res.status(200).json({
            success: true,
            message: 'Login successful',
            data: {
                user: user.getPublicProfile(),
                token
            }
        });
    } catch (error) {
        console.error('Signin error:', error);
        res.status(500).json({
            success: false,
            message: 'Error logging in'
        });
    }
};

/**
 * @desc    Logout user
 * @route   POST /api/auth/logout
 * @access  Private
 */
exports.logout = async (req, res) => {
    try {
        const user = await User.findById(req.user._id);
        user.isOnline = false;
        user.lastSeen = new Date();
        await user.save();

        res.status(200).json({
            success: true,
            message: 'Logout successful'
        });
    } catch (error) {
        console.error('Logout error:', error);
        res.status(500).json({
            success: false,
            message: 'Error logging out'
        });
    }
};

/**
 * @desc    Get current user
 * @route   GET /api/auth/me
 * @access  Private
 */
exports.getMe = async (req, res) => {
    try {
        const user = await User.findById(req.user._id).populate('clubsJoined.clubId', 'name logo');

        res.status(200).json({
            success: true,
            data: user
        });
    } catch (error) {
        console.error('Get me error:', error);
        res.status(500).json({
            success: false,
            message: 'Error fetching user data'
        });
    }
};

/**
 * @desc    Update user profile
 * @route   PUT /api/auth/update-profile
 * @access  Private
 */
exports.updateProfile = async (req, res) => {
    try {
        const { displayName, phoneNumber, preferences, fullName, birthDate, branch, passoutYear } = req.body;

        const user = await User.findById(req.user._id);

        if (displayName) user.displayName = displayName;
        if (phoneNumber) user.phoneNumber = phoneNumber;
        if (preferences) user.preferences = { ...user.preferences, ...preferences };

        // New profile fields
        if (fullName) user.fullName = fullName;
        if (birthDate) user.birthDate = new Date(birthDate);
        if (branch) user.branch = branch;
        if (passoutYear) user.passoutYear = passoutYear;

        await user.save();

        res.status(200).json({
            success: true,
            message: 'Profile updated successfully',
            data: user.getPublicProfile()
        });
    } catch (error) {
        console.error('Update profile error:', error);
        res.status(500).json({
            success: false,
            message: 'Error updating profile'
        });
    }
};

/**
 * @desc    Upload profile picture
 * @route   POST /api/auth/upload-profile-picture
 * @access  Private
 */
exports.uploadProfilePicture = async (req, res) => {
    try {
        console.log('Upload Profile Picture reached');
        console.log('req.file:', req.file ? {
            fieldname: req.file.fieldname,
            originalname: req.file.originalname,
            mimetype: req.file.mimetype,
            size: req.file.size
        } : 'undefined');
        console.log('req.body:', req.body);

        if (!req.file) {
            return res.status(400).json({
                success: false,
                message: 'Please upload an image'
            });
        }

        // Upload to Cloudinary using buffer (since we use memoryStorage)
        const result = await uploadImageBuffer(req.file.buffer, 'mavericks/profiles');

        // Update user
        const user = await User.findById(req.user._id);
        user.profilePicture = {
            url: result.url,
            publicId: result.publicId
        };
        await user.save();

        res.status(200).json({
            success: true,
            message: 'Profile picture uploaded successfully',
            data: {
                profilePicture: user.profilePicture
            }
        });
    } catch (error) {
        console.error('Upload profile picture error:', error);
        res.status(500).json({
            success: false,
            message: error.message || 'Error uploading profile picture'
        });
    }
};

/**
 * @desc    Change password
 * @route   PUT /api/auth/change-password
 * @access  Private
 */
exports.changePassword = async (req, res) => {
    try {
        const { currentPassword, newPassword } = req.body;

        if (!currentPassword || !newPassword) {
            return res.status(400).json({
                success: false,
                message: 'Please provide current and new password'
            });
        }

        // Get user with password
        const user = await User.findById(req.user._id).select('+password');

        // Check current password
        const isMatch = await user.comparePassword(currentPassword);
        if (!isMatch) {
            return res.status(401).json({
                success: false,
                message: 'Current password is incorrect'
            });
        }

        // Update password
        user.password = newPassword;
        await user.save();

        res.status(200).json({
            success: true,
            message: 'Password changed successfully'
        });
    } catch (error) {
        console.error('Change password error:', error);
        res.status(500).json({
            success: false,
            message: 'Error changing password'
        });
    }
};

/**
 * @desc    Update FCM token for push notifications
 * @route   PUT /api/auth/fcm-token
 * @access  Private
 */
exports.updateFCMToken = async (req, res) => {
    try {
        const { fcmToken } = req.body;

        const user = await User.findById(req.user._id);
        user.fcmToken = fcmToken;
        await user.save();

        res.status(200).json({
            success: true,
            message: 'FCM token updated successfully'
        });
    } catch (error) {
        console.error('Update FCM token error:', error);
        res.status(500).json({
            success: false,
            message: 'Error updating FCM token'
        });
    }
};

/**
 * @desc    Get user dashboard data
 * @route   GET /api/auth/dashboard
 * @access  Private
 */
exports.getDashboardData = async (req, res) => {
    try {
        const userId = req.user._id;
        const now = new Date();
        const user = await User.findById(userId);
        const clubIds = user.clubsJoined.map(c => (c.clubId?._id || c.clubId).toString());

        // Global Stats
        const clubsJoinedCount = user.clubsJoined.length;
        const upcomingMeetingsCount = await Meeting.countDocuments({
            clubId: { $in: clubIds },
            date: { $gte: now },
            status: { $ne: 'canceled' }
        });
        const pendingTasksCount = await Task.countDocuments({
            assignedTo: userId,
            status: { $in: ['pending', 'in-progress'] }
        });

        const allPastMeetings = await Meeting.find({
            clubId: { $in: clubIds },
            status: { $in: ['completed', 'ongoing'] }
        });

        let globalTotal = 0;
        let globalPresent = 0;
        allPastMeetings.forEach(m => {
            const attendee = m.attendees.find(a => a.userId.toString() === userId.toString());
            if (attendee) {
                globalTotal++;
                if (attendee.status === 'present' || attendee.status === 'late') globalPresent++;
            }
        });
        const globalAttendanceRateStr = globalTotal > 0 ? `${Math.round((globalPresent / globalTotal) * 100)}%` : '0%';

        // Calculate per-club stats
        const clubStats = await Promise.all(user.clubsJoined.map(async (c) => {
            const clubId = c.clubId;
            const clubInfo = await Club.findById(clubId).select('name');

            const upcoming = await Meeting.countDocuments({
                clubId,
                date: { $gte: now },
                status: { $ne: 'canceled' }
            });

            const clubPastMeetings = await Meeting.find({
                clubId,
                status: { $in: ['completed', 'ongoing'] }
            });

            let clubEligible = 0;
            let clubPresent = 0;
            clubPastMeetings.forEach(m => {
                const attendee = m.attendees.find(a => a.userId.toString() === userId.toString());
                if (attendee) {
                    clubEligible++;
                    if (attendee.status === 'present' || attendee.status === 'late') clubPresent++;
                }
            });

            const clubTasks = await Task.countDocuments({
                assignedTo: userId,
                clubId,
                status: { $in: ['pending', 'in-progress'] }
            });

            return {
                clubId: clubId.toString(),
                clubName: clubInfo?.name || 'Unknown Club',
                stats: {
                    upcomingMeetings: upcoming,
                    pendingTasks: clubTasks,
                    attendanceRate: clubEligible > 0 ? `${Math.round((clubPresent / clubEligible) * 100)}%` : '0%'
                }
            };
        }));

        // Recent Activity (Mixed upcoming and recent past)
        const recentActivity = await Meeting.find({
            clubId: { $in: clubIds },
            status: { $ne: 'canceled' }
        })
            .populate('clubId', 'name')
            .sort({ date: -1 }) // Newest first
            .limit(10);

        const processedRecentMeetings = recentActivity.map(m => {
            const attendee = m.attendees.find(a => a.userId.toString() === userId.toString());
            let attendanceStatus = 'Upcoming';
            if (new Date(m.date) < now) {
                if (attendee) {
                    attendanceStatus = (attendee.status === 'present' || attendee.status === 'late') ? 'Attended' : 'Not Attended';
                } else {
                    attendanceStatus = 'Missed';
                }
            } else if (attendee && (attendee.status === 'present' || attendee.status === 'late')) {
                attendanceStatus = 'Attended';
            }

            return {
                ...m.toObject(),
                attendanceStatus
            };
        });

        res.status(200).json({
            success: true,
            data: {
                globalStats: {
                    clubsJoined: clubsJoinedCount,
                    upcomingMeetings: upcomingMeetingsCount,
                    pendingTasks: pendingTasksCount,
                    attendanceRate: globalAttendanceRateStr
                },
                clubStats,
                recentMeetings: processedRecentMeetings,
                birthdays: await (async () => {
                    const todayMonth = now.getMonth() + 1;
                    const todayDay = now.getDate();

                    // Find all users with birthday today
                    const birthdayUsers = await User.find({
                        birthDate: { $exists: true },
                        $expr: {
                            $and: [
                                { $eq: [{ $month: '$birthDate' }, todayMonth] },
                                { $eq: [{ $dayOfMonth: '$birthDate' }, todayDay] }
                            ]
                        }
                    }).select('displayName profilePicture clubsJoined');

                    // Filter for shared clubs (excluding self)
                    return birthdayUsers.filter(u => {
                        if (u._id.toString() === userId.toString()) return false;
                        const userClubIds = u.clubsJoined.map(c => (c.clubId?._id || c.clubId).toString());
                        return userClubIds.some(cid => clubIds.includes(cid));
                    }).map(u => ({
                        _id: u._id,
                        displayName: u.displayName,
                        profilePicture: u.profilePicture
                    }));
                })()
            }
        });
    } catch (error) {
        console.error('Dashboard data error:', error);
        res.status(500).json({
            success: false,
            message: 'Error fetching dashboard data'
        });
    }
};
