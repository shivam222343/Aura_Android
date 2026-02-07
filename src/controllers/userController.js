const User = require('../models/User');

/**
 * @desc    Get club members with birthdays today
 * @route   GET /api/users/birthdays-today
 * @access  Private
 */
exports.getBirthdaysToday = async (req, res) => {
    try {
        const currentUser = await User.findById(req.user._id).populate('clubsJoined.clubId');

        if (!currentUser || !currentUser.clubsJoined || currentUser.clubsJoined.length === 0) {
            return res.status(200).json({
                success: true,
                data: []
            });
        }

        // Get user's club IDs
        const userClubIds = currentUser.clubsJoined.map(c => c.clubId._id.toString());

        // Get today's date (month and day only) - using UTC
        const today = new Date();
        const todayMonth = today.getUTCMonth() + 1; // 1-12
        const todayDay = today.getUTCDate(); // 1-31

        console.log(`🎂 Checking birthdays for: ${todayMonth}/${todayDay}`);

        // Find all users with birthdays who are in the same clubs
        const birthdayMembers = await User.find({
            _id: { $ne: req.user._id }, // Exclude current user
            birthDate: { $exists: true, $ne: null },
            'clubsJoined.clubId': { $in: userClubIds }
        }).populate('clubsJoined.clubId');

        console.log(`📋 Found ${birthdayMembers.length} club members with birthDate set`);

        // Filter by exact birthday (month and day only, ignore year)
        const todayBirthdays = birthdayMembers.filter(user => {
            if (!user.birthDate) return false;

            const birthDate = new Date(user.birthDate);
            const birthMonth = birthDate.getUTCMonth() + 1;
            const birthDay = birthDate.getUTCDate();

            const isMatch = birthMonth === todayMonth && birthDay === todayDay;

            if (isMatch) {
                console.log(`🎉 Birthday match: ${user.displayName} - ${birthMonth}/${birthDay}`);
            }

            return isMatch;
        });

        console.log(`🎂 Total birthdays today: ${todayBirthdays.length}`);

        // Format response with club name
        const formattedBirthdays = todayBirthdays.map(user => {
            // Find common club
            const commonClub = user.clubsJoined.find(uc =>
                userClubIds.includes(uc.clubId._id.toString())
            );

            return {
                _id: user._id,
                displayName: user.displayName,
                profilePicture: user.profilePicture,
                birthDate: user.birthDate,
                clubName: commonClub?.clubId?.name || 'Aura',
                maverickId: user.maverickId
            };
        });

        res.status(200).json({
            success: true,
            data: formattedBirthdays
        });
    } catch (error) {
        console.error('Get birthdays today error:', error);
        res.status(500).json({
            success: false,
            message: 'Error fetching birthday members'
        });
    }
};

/**
 * @desc    Save FCM token for push notifications
 * @route   PUT /api/users/fcm-token
 * @access  Private
 */
exports.saveFCMToken = async (req, res) => {
    try {
        const { fcmToken } = req.body;

        if (!fcmToken) {
            return res.status(400).json({
                success: false,
                message: 'FCM token is required'
            });
        }

        const user = await User.findByIdAndUpdate(
            req.user._id,
            { fcmToken },
            { new: true }
        );

        console.log(`✅ FCM token saved for user: ${user.displayName}`);

        res.status(200).json({
            success: true,
            message: 'FCM token saved successfully'
        });
    } catch (error) {
        console.error('Save FCM token error:', error);
        res.status(500).json({
            success: false,
            message: 'Error saving FCM token'
        });
    }
};

/**
 * @desc    Remove FCM token (on logout)
 * @route   DELETE /api/users/fcm-token
 * @access  Private
 */
exports.removeFCMToken = async (req, res) => {
    try {
        await User.findByIdAndUpdate(
            req.user._id,
            { $unset: { fcmToken: 1 } }
        );

        console.log(`✅ FCM token removed for user: ${req.user.displayName}`);

        res.status(200).json({
            success: true,
            message: 'FCM token removed successfully'
        });
    } catch (error) {
        console.error('Remove FCM token error:', error);
        res.status(500).json({
            success: false,
            message: 'Error removing FCM token'
        });
    }
};
