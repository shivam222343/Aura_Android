const jwt = require('jsonwebtoken');
const User = require('../models/User');
const Club = require('../models/Club');
const Meeting = require('../models/Meeting');
const Task = require('../models/Task');
const { uploadImage, uploadImageBuffer } = require('../config/cloudinary');
const { getCache, setCache, delCache } = require('../utils/cache');

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
            role: email.includes('admin') ? 'admin' : 'member',
            profilePicture: {
                url: `https://api.dicebear.com/9.x/notionists/png?seed=${Math.random().toString(36).substring(7)}&backgroundColor=b6e3f4,c0aede,d1d4f9`,
                publicId: 'default-ai'
            }
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

        user.isOnline = true;
        user.lastSeen = new Date();
        await user.save();

        // Invalidate profile cache
        await delCache(`user:profile:${user._id}`);

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
        const cacheKey = `user:profile:${req.user._id}`;
        const cachedUser = await getCache(cacheKey);

        if (cachedUser) {
            return res.status(200).json({
                success: true,
                data: cachedUser,
                source: 'cache'
            });
        }

        const user = await User.findById(req.user._id).populate('clubsJoined.clubId', 'name logo');

        await setCache(cacheKey, user, 3600); // Cache for 1 hour

        res.status(200).json({
            success: true,
            data: user,
            source: 'database'
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
        if (preferences) {
            // Explicitly handle preferences updates to avoid Mongoose subdocument issues
            if (preferences.theme) {
                user.preferences.theme = preferences.theme;
            }
            if (preferences.sidebarBanner !== undefined) {
                user.preferences.sidebarBanner = preferences.sidebarBanner;
            }

            // For nested objects like notifications, we should be careful to merge
            if (preferences.notifications) {
                if (!user.preferences.notifications) {
                    user.preferences.notifications = {
                        email: true, push: true, meetings: true, tasks: true
                    };
                }

                // Manually merge known fields to be safe
                if (preferences.notifications.email !== undefined) user.preferences.notifications.email = preferences.notifications.email;
                if (preferences.notifications.push !== undefined) user.preferences.notifications.push = preferences.notifications.push;
                if (preferences.notifications.meetings !== undefined) user.preferences.notifications.meetings = preferences.notifications.meetings;
                if (preferences.notifications.tasks !== undefined) user.preferences.notifications.tasks = preferences.notifications.tasks;
            }

            // Force Mongoose to acknowledge the change for mixed/nested types if needed
            user.markModified('preferences');
        }

        // New profile fields
        if (fullName) user.fullName = fullName;
        if (birthDate) user.birthDate = new Date(birthDate);
        if (branch) user.branch = branch;
        if (passoutYear) user.passoutYear = passoutYear;

        // Support updating profile picture via URL directly (e.g. from AI avatars or History or Web Upload)
        if (req.body.profilePictureUrl || req.body.imageUrl) {
            const url = req.body.profilePictureUrl || req.body.imageUrl;
            const publicId = req.body.publicId || 'ai-generated';

            // Save current pic to history if it valid
            if (user.profilePicture && user.profilePicture.url && !user.profilePicture.url.includes('dicebear')) {
                // Avoid duplicates at the top of the stack
                if (user.profilePictureHistory.length === 0 || user.profilePictureHistory[0].url !== user.profilePicture.url) {
                    user.profilePictureHistory.unshift({
                        url: user.profilePicture.url,
                        publicId: user.profilePicture.publicId,
                        uploadedAt: new Date()
                    });
                }
                // Keep only last 10
                if (user.profilePictureHistory.length > 10) {
                    user.profilePictureHistory = user.profilePictureHistory.slice(0, 10);
                }
            }

            user.profilePicture = {
                url: url,
                publicId: publicId
            };
        }


        await user.save();

        // Invalidate caches
        await delCache(`user:profile:${user._id}`);
        await delCache(`user:dashboard:${user._id}`);

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
        console.log('req.file:', req.file ? 'FormData upload' : 'Base64 upload');
        console.log('req.body:', req.body);

        let buffer;

        // Handle both FormData and base64
        if (req.file) {
            // FormData upload (web)
            buffer = req.file.buffer;
        } else if (req.body.image) {
            // Base64 upload (Android)
            const base64Data = req.body.image.split(',')[1];
            buffer = Buffer.from(base64Data, 'base64');
        } else {
            return res.status(400).json({
                success: false,
                message: 'Please upload an image'
            });
        }

        // Upload to Cloudinary using buffer
        const result = await uploadImageBuffer(buffer, 'mavericks/profiles');

        // Update user
        const user = await User.findById(req.user._id);

        // Save current pic to history if it exists and is not default
        if (user.profilePicture && user.profilePicture.url && !user.profilePicture.url.includes('dicebear')) {
            user.profilePictureHistory.unshift({
                url: user.profilePicture.url,
                publicId: user.profilePicture.publicId,
                uploadedAt: new Date()
            });
            // Keep only last 10
            if (user.profilePictureHistory.length > 10) {
                user.profilePictureHistory = user.profilePictureHistory.slice(0, 10);
            }
        }

        user.profilePicture = {
            url: result.url,
            publicId: result.publicId
        };
        await user.save();

        // Invalidate caches
        await delCache(`user:profile:${user._id}`);
        await delCache(`user:dashboard:${user._id}`);

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
        const cacheKey = `user:dashboard:${userId}`;
        const cachedDashboard = await getCache(cacheKey);

        if (cachedDashboard) {
            return res.status(200).json({
                success: true,
                data: cachedDashboard,
                source: 'cache'
            });
        }

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
            const absenceRequest = m.absenceRequests.find(a => a.userId.toString() === userId.toString());

            let attendanceStatus = 'Upcoming';

            if (m.status === 'completed' || m.status === 'ongoing') {
                if (attendee && (attendee.status === 'present' || attendee.status === 'late')) {
                    attendanceStatus = 'Attended';
                } else if (absenceRequest && absenceRequest.status === 'approved') {
                    attendanceStatus = 'Excused';
                } else if (m.status === 'completed') {
                    attendanceStatus = 'Not Attended';
                } else {
                    attendanceStatus = 'Live';
                }
            } else if (m.status === 'canceled' || m.status === 'cancelled') {
                attendanceStatus = 'Canceled';
            } else if (new Date(m.date) < now) {
                if (attendee && (attendee.status === 'present' || attendee.status === 'late')) {
                    attendanceStatus = 'Attended';
                } else if (absenceRequest && absenceRequest.status === 'approved') {
                    attendanceStatus = 'Excused';
                } else {
                    attendanceStatus = 'Missed';
                }
            } else {
                attendanceStatus = 'Upcoming';
            }

            return {
                ...m.toObject(),
                attendanceStatus
            };
        });

        const dashboardData = {
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

                    // Filter for shared clubs (Include self if it's their birthday)
                    return birthdayUsers.filter(u => {
                        const isSelf = u._id.toString() === userId.toString();
                        if (isSelf) return true;

                        const userClubIds = u.clubsJoined.map(c => (c.clubId?._id || c.clubId).toString());
                        return userClubIds.some(cid => clubIds.includes(cid));
                    }).map(u => ({
                        _id: u._id,
                        displayName: u.displayName,
                        profilePicture: u.profilePicture
                    }));
                })()
            }
        };

        // Cache dashboard for 5 minutes
        await setCache(cacheKey, dashboardData.data, 300);

        res.status(200).json(dashboardData);
    } catch (error) {
        console.error('Dashboard data error:', error);
        res.status(500).json({
            success: false,
            message: 'Error fetching dashboard data'
        });
    }
};
