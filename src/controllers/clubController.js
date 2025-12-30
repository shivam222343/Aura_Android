const Club = require('../models/Club');
const User = require('../models/User');
const { uploadImage } = require('../config/cloudinary');

/**
 * @desc    Get all clubs
 * @route   GET /api/clubs
 * @access  Private
 */
exports.getAllClubs = async (req, res) => {
    try {
        const clubs = await Club.find()
            .populate('createdBy', 'displayName profilePicture')
            .sort('-createdAt');

        res.status(200).json({
            success: true,
            count: clubs.length,
            data: clubs
        });
    } catch (error) {
        //...
    }
};

exports.createClub = async (req, res) => {
    try {
        const { name, description } = req.body;
        // req.file contains the image if using multer

        // Check if club exists
        const existingClub = await Club.findOne({ name });
        if (existingClub) {
            return res.status(400).json({
                success: false,
                message: 'Club with this name already exists'
            });
        }

        let logo = {
            url: 'https://via.placeholder.com/150',
            publicId: null
        };

        // Handle image upload if provided
        if (req.file) {
            const result = await uploadImage(req.file.path, 'mavericks/clubs');
            logo = {
                url: result.url,
                publicId: result.publicId
            };
        }

        const club = await Club.create({
            name,
            description,
            logo,
            createdBy: req.user._id,
            admins: [req.user._id]
        });

        // Add creator as admin of the club in User model
        await User.findByIdAndUpdate(
            req.user._id,
            {
                $push: {
                    clubsJoined: {
                        clubId: club._id,
                        role: 'admin'
                    }
                }
            }
        );

        res.status(201).json({
            success: true,
            data: club
        });
    } catch (error) {
        console.error('Create club error:', error);
        res.status(500).json({
            success: false,
            message: 'Error creating club'
        });
    }
};

/**
 * @desc    Add member to club via Maverick ID
 * @route   POST /api/clubs/add-member
 * @access  Admin/Subadmin
 */
exports.addMemberToClub = async (req, res) => {
    try {
        const { clubId, maverickId } = req.body;

        console.log('[Club] Add Member Request:', JSON.stringify(req.body));

        if (!clubId || !maverickId) {
            return res.status(400).json({
                success: false,
                message: 'Club ID and Maverick ID are required'
            });
        }

        // Normalize ID
        const normalizedMavId = maverickId.trim().toUpperCase();

        const club = await Club.findById(clubId);
        if (!club) {
            console.log(`[Club] Club not found: ${clubId}`);
            return res.status(404).json({
                success: false,
                message: 'Club not found'
            });
        }

        const user = await User.findOne({ maverickId: normalizedMavId });
        if (!user) {
            console.log(`[Club] User not found: ${normalizedMavId}`);
            return res.status(404).json({
                success: false,
                message: `User with Maverick ID '${normalizedMavId}' not found. Please check the ID.`
            });
        }

        // Check if user is already in the club
        const isMember = user.clubsJoined.some(
            c => c.clubId.toString() === clubId
        );

        if (isMember) {
            return res.status(400).json({
                success: false,
                message: `User '${user.displayName}' is already a member or admin of this club`
            });
        }

        // Add to user's club list
        user.clubsJoined.push({
            clubId: club._id,
            role: 'member'
        });

        // Upgrade global role if currently 'user'
        if (user.role === 'user') {
            user.role = 'member';
        }

        await user.save();

        res.status(200).json({
            success: true,
            message: 'User added to club successfully',
            data: user
        });

    } catch (error) {
        console.error('Add member error:', error);
        res.status(500).json({
            success: false,
            message: 'Error adding member'
        });
    }
};

/**
 * @desc    Get members of a club
 * @route   GET /api/clubs/:id/members
 * @access  Private
 */
exports.getClubMembers = async (req, res) => {
    try {
        const clubId = req.params.id;

        // API Safety: Check if ID is valid
        if (!clubId.match(/^[0-9a-fA-F]{24}$/)) {
            return res.status(400).json({
                success: false,
                message: 'Invalid Club ID format'
            });
        }

        // Enforce membership check: User must be in the club or be an admin
        const isMember = req.user.clubsJoined.some(c => c.clubId.toString() === clubId) || req.user.role === 'admin';
        if (!isMember) {
            return res.status(403).json({
                success: false,
                message: 'Access denied. You must be a member of this club to view its members.'
            });
        }

        const members = await User.find({ 'clubsJoined.clubId': clubId })
            .select('displayName email maverickId role profilePicture clubsJoined');

        res.status(200).json({
            success: true,
            count: members.length,
            data: members
        });
    } catch (error) {
        console.error('Get club members error:', error);
        res.status(500).json({
            success: false,
            message: 'Error fetching club members'
        });
    }
};

/**
 * @desc    Remove member from club
 * @route   POST /api/clubs/remove-member
 * @access  Admin/Subadmin
 */
exports.removeMemberFromClub = async (req, res) => {
    try {
        const { clubId, userId } = req.body;

        if (!clubId || !userId) {
            return res.status(400).json({
                success: false,
                message: 'Club ID and User ID are required'
            });
        }

        const user = await User.findById(userId);
        if (!user) {
            return res.status(404).json({
                success: false,
                message: 'User not found'
            });
        }

        // Remove club from user's list
        user.clubsJoined = user.clubsJoined.filter(
            c => c.clubId.toString() !== clubId
        );

        // Downgrade global role if no clubs left and role is 'member'
        if (user.clubsJoined.length === 0 && user.role === 'member') {
            user.role = 'user';
        }

        await user.save();

        res.status(200).json({
            success: true,
            message: 'Member removed successfully'
        });
    } catch (error) {
        console.error('Remove member error:', error);
        res.status(500).json({
            success: false,
            message: 'Error removing member'
        });
    }
};

/**
 * @desc    Delete club
 * @route   DELETE /api/clubs/:id
 * @access  Admin
 */
exports.deleteClub = async (req, res) => {
    try {
        const { superKey } = req.body;
        const validKey = process.env.ADMIN_SUPER_KEY;

        if (!validKey || superKey !== validKey) {
            return res.status(403).json({
                success: false,
                message: 'Invalid Super Key. Access Denied.'
            });
        }

        const club = await Club.findById(req.params.id);

        if (!club) {
            return res.status(404).json({
                success: false,
                message: 'Club not found'
            });
        }

        // Remove club reference from all users
        await User.updateMany(
            { 'clubsJoined.clubId': club._id },
            { $pull: { clubsJoined: { clubId: club._id } } }
        );

        await club.deleteOne();

        res.status(200).json({
            success: true,
            message: 'Club deleted successfully'
        });
    } catch (error) {
        console.error('Delete club error:', error);
        res.status(500).json({
            success: false,
            message: 'Error deleting club'
        });
    }
};
