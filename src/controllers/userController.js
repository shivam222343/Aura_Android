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

        // Get today's date (month and day only)
        const today = new Date();
        const todayMonth = today.getMonth() + 1; // 1-12
        const todayDay = today.getDate(); // 1-31

        // Find all users with birthdays today who are in the same clubs
        const birthdayMembers = await User.find({
            _id: { $ne: req.user._id }, // Exclude current user
            birthDate: { $exists: true, $ne: null },
            'clubsJoined.clubId': { $in: userClubIds }
        }).populate('clubsJoined.clubId');

        // Filter by exact birthday (month and day)
        const todayBirthdays = birthdayMembers.filter(user => {
            if (!user.birthDate) return false;
            const birthDate = new Date(user.birthDate);
            return birthDate.getMonth() + 1 === todayMonth && birthDate.getDate() === todayDay;
        });

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
                clubName: commonClub?.clubId?.name || 'Mavericks',
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
