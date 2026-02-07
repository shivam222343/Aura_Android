const Club = require('../models/Club');
const User = require('../models/User');
const Notification = require('../models/Notification');
const GroupChat = require('../models/GroupChat');
const { sendPushNotification } = require('../utils/pushNotifications');
const { uploadImageBuffer } = require('../config/cloudinary');
const { getCache, setCache, delCache } = require('../utils/cache');

/**
 * @desc    Get all clubs
 * @route   GET /api/clubs
 * @access  Private
 */
exports.getAllClubs = async (req, res) => {
    try {
        const cacheKey = 'clubs:all';
        const cachedClubs = await getCache(cacheKey);

        if (cachedClubs) {
            return res.status(200).json({
                success: true,
                count: cachedClubs.length,
                data: cachedClubs,
                source: 'cache'
            });
        }

        const clubs = await Club.find()
            .populate('createdBy', 'displayName profilePicture')
            .sort('-createdAt');

        await setCache(cacheKey, clubs, 3600); // Cache for 1 hour

        res.status(200).json({
            success: true,
            count: clubs.length,
            data: clubs,
            source: 'database'
        });
    } catch (error) {
        console.error('Get all clubs error:', error);
        res.status(500).json({
            success: false,
            message: 'Error fetching clubs'
        });
    }
};

exports.createClub = async (req, res) => {
    try {
        const { name, description, logoUrl, publicId } = req.body;
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
            url: logoUrl || 'https://via.placeholder.com/150',
            publicId: publicId || null
        };

        // Handle image upload if provided
        if (req.file) {
            const result = await uploadImageBuffer(req.file.buffer, 'aura/collectives');
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

        // Invalidate clubs cache
        await delCache('clubs:all');

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
 * @desc    Update club details (Name, Description, Logo)
 * @route   PUT /api/clubs/:id
 * @access  Private (Club Admins/Members)
 */
exports.updateClub = async (req, res) => {
    try {
        let club = await Club.findById(req.params.id);

        if (!club) {
            return res.status(404).json({ success: false, message: 'Club not found' });
        }

        // Check if user is authorized (Admin or Club Member)
        const isMember = req.user.clubsJoined.some(c => c.clubId.toString() === req.params.id);
        if (!isMember && req.user.role !== 'admin') {
            return res.status(403).json({ success: false, message: 'Not authorized to update this club' });
        }

        const { name, description, logoUrl, publicId } = req.body;
        if (name) club.name = name;
        if (description) club.description = description;

        // Handle Image Upload
        if (req.file) {
            try {
                const result = await uploadImageBuffer(req.file.buffer, 'aura/collectives');
                club.logo = {
                    url: result.url,
                    publicId: result.publicId
                };
            } catch (err) {
                console.error('Cloudinary upload error:', err);
                return res.status(500).json({ success: false, message: 'Image upload failed' });
            }
        } else if (logoUrl) {
            club.logo = {
                url: logoUrl,
                publicId: publicId || ''
            };
        }


        await club.save();
        await delCache('clubs:all');


        res.status(200).json({
            success: true,
            data: club
        });
    } catch (error) {
        console.error('Update club error:', error);
        res.status(500).json({ success: false, message: 'Error updating club' });
    }
};

/**
 * @desc    Update club logo using base64 (for Android compatibility)
 * @route   PUT /api/clubs/:id/logo-base64
 * @access  Admin/Subadmin/Club Admin
 */
exports.updateClubLogoBase64 = async (req, res) => {
    try {
        const club = await Club.findById(req.params.id);
        if (!club) {
            return res.status(404).json({ success: false, message: 'Club not found' });
        }

        const { logo } = req.body;
        if (!logo) {
            return res.status(400).json({ success: false, message: 'Please provide logo data' });
        }

        // Check authorization
        const isMember = req.user.clubsJoined.some(c => c.clubId.toString() === req.params.id);
        if (!isMember && req.user.role !== 'admin') {
            return res.status(403).json({ success: false, message: 'Unauthorized' });
        }

        // Convert base64 to buffer
        const base64Data = logo.split(',')[1];
        const buffer = Buffer.from(base64Data, 'base64');

        // Upload to Cloudinary
        const result = await uploadImageBuffer(buffer, 'aura/collectives');

        club.logo = {
            url: result.url,
            publicId: result.publicId
        };

        await club.save();
        await delCache('clubs:all');


        res.status(200).json({
            success: true,
            data: club
        });
    } catch (error) {
        console.error('Update club logo base64 error:', error);
        res.status(500).json({ success: false, message: 'Error updating logo' });
    }
};

/**
 * @desc    Get members with attendance warnings (3+ missed)
 * @route   GET /api/clubs/:id/members-warnings
 * @access  Admin/Club Admin
 */
exports.getClubMembersWithWarnings = async (req, res) => {
    try {
        const clubId = req.params.id;

        // Verify authorization (Admin or Club Admin)
        const userClubRole = req.user.clubsJoined.find(c => c.clubId.toString() === clubId.toString())?.role;
        if (req.user.role !== 'admin' && userClubRole !== 'admin') {
            return res.status(403).json({ success: false, message: 'Not authorized to view warnings' });
        }

        const users = await User.find({
            'clubsJoined': {
                $elemMatch: {
                    clubId: clubId,
                    consecutiveAbsences: { $gte: 3 }
                }
            }
        }).select('displayName maverickId email phoneNumber clubsJoined');

        // Filter and format for display/export
        const results = users.map(user => {
            const clubInfo = user.clubsJoined.find(c => c.clubId.toString() === clubId.toString());
            return {
                id: user._id,
                displayName: user.displayName,
                maverickId: user.maverickId,
                email: user.email,
                phoneNumber: user.phoneNumber,
                role: clubInfo.role,
                consecutiveAbsences: clubInfo.consecutiveAbsences,
                joinedAt: clubInfo.joinedAt
            };
        });

        res.status(200).json({
            success: true,
            count: results.length,
            data: results
        });
    } catch (error) {
        console.error('Get attendance warnings error:', error);
        res.status(500).json({ success: false, message: 'Server Error' });
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
                message: 'Collective ID and Artist-id are required'
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
            console.log(`[Collective] User not found: ${normalizedMavId}`);
            return res.status(404).json({
                success: false,
                message: `User with Artist-id '${normalizedMavId}' not found. Please check the ID.`
            });
        }

        // Check if user is already in the club
        const isMember = user.clubsJoined.some(
            c => c.clubId.toString() === clubId
        );

        if (isMember) {
            return res.status(400).json({
                success: false,
                message: `User '${user.displayName}' is already a member or admin of this collective`
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

        // Sync with GroupChat
        let groupChat = await GroupChat.findOne({ clubId: club._id });
        if (groupChat) {
            const isAlreadyMember = groupChat.members.some(m => m.userId.toString() === user._id.toString());
            if (!isAlreadyMember) {
                groupChat.members.push({ userId: user._id, role: 'member' });
                await groupChat.save();
            }
        } else {
            // Create group chat if it doesn't exist
            await GroupChat.create({
                clubId: club._id,
                members: [{ userId: user._id, role: 'member' }],
                messages: []
            });
        }

        // Emit socket event for real-time members update
        const io = req.app.get('io');
        if (io) {
            io.to(`club:${clubId}`).emit('club:members:update', { clubId });
        }

        // Invalidate club members cache
        await delCache(`club:members:${clubId}`);

        // Create Persistent Notification
        try {
            await Notification.create({
                userId: user._id,
                type: 'member_joined', // Fixed: was 'member_added' (not in enum)
                title: `Welcome to ${club.name}! 🎊`,
                message: `You have been added to the collective ${club.name} as a ${user.role}.`,
                clubId: clubId
            });
        } catch (notifErr) {
            console.error('Notification creation error in addMember:', notifErr);
            // Don't fail the whole request if local notification fails
        }

        // Trigger in-app refresh for the user
        io?.to(user._id.toString()).emit('notification_receive', {});

        // Send Push Notification
        try {
            await sendPushNotification(user._id, {
                title: `Welcome to ${club.name}! 🎊`,
                body: `You are now a member of ${club.name}.`,
                data: { screen: 'Dashboard', clubId: clubId }
            });
        } catch (pushErr) {
            console.error('Push notification error in addMember:', pushErr);
        }

        res.status(200).json({
            success: true,
            message: 'User added to club successfully',
            data: user
        });

    } catch (error) {
        console.error('[Club] Add member error details:', {
            error: error.message,
            stack: error.stack,
            clubId,
            maverickId
        });
        res.status(500).json({
            success: false,
            message: 'Error adding member',
            error: error.message
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

        const cacheKey = `club:members:${clubId}`;
        const cachedMembers = await getCache(cacheKey);

        if (cachedMembers) {
            return res.status(200).json({
                success: true,
                count: cachedMembers.length,
                data: cachedMembers,
                source: 'cache'
            });
        }

        const members = await User.find({ 'clubsJoined.clubId': clubId })
            .select('displayName email maverickId role profilePicture clubsJoined');

        await setCache(cacheKey, members, 1800); // Cache for 30 mins

        res.status(200).json({
            success: true,
            count: members.length,
            data: members,
            source: 'database'
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
                message: 'Collective ID and User ID are required'
            });
        }

        const club = await Club.findById(clubId);
        if (!club) {
            return res.status(404).json({
                success: false,
                message: 'Club not found'
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

        // Sync with GroupChat
        const GroupChat = require('../models/GroupChat');
        const groupChat = await GroupChat.findOne({ clubId });
        if (groupChat) {
            groupChat.members = groupChat.members.filter(m => m.userId.toString() !== userId);
            await groupChat.save();
        }

        // Emit socket event for real-time members update
        const io = req.app.get('io');
        if (io) {
            io.to(`club:${clubId}`).emit('club:members:update', { clubId });
        }

        // Invalidate club members cache
        await delCache(`club:members:${clubId}`);

        // Send Push Notification (User removed)
        try {
            await sendPushNotification(userId, {
                title: `Removed from ${club.name}`,
                body: `You have been removed from the club ${club.name}.`,
                data: { screen: 'Dashboard' }
            });
        } catch (pushErr) {
            console.error('Push notification error in removeMember:', pushErr);
        }

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

        // Invalidate caches
        await delCache('clubs:all');
        await delCache(`club:members:${req.params.id}`);

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
