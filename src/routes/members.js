const express = require('express');
const router = express.Router();
const { protect } = require('../middleware/auth');
const User = require('../models/User');
const Club = require('../models/Club');
const Meeting = require('../models/Meeting');

// Get all members for a club
router.get('/:clubId', protect, async (req, res) => {
    try {
        const { clubId } = req.params;
        console.log(`[Members] Fetching members for club: ${clubId}`);

        const club = await Club.findById(clubId);
        if (!club) {
            return res.status(404).json({
                success: false,
                message: 'Club not found'
            });
        }

        // Fetch users using the clubsJoined array on User model
        let members = await User.find({
            'clubsJoined.clubId': clubId
        }).select('displayName email profilePicture isOnline lastSeen clubsJoined stats');

        console.log(`[Members] Found ${members.length} members for club ${club.name}`);

        // Fallback: If no members found via User query, try using the Club's member arrays
        if (members.length === 0) {
            console.log(`[Members] Fallback: Searching via Club.members array`);
            const allMemberIds = [...club.members, ...club.admins, ...club.alumni];
            if (allMemberIds.length > 0) {
                members = await User.find({
                    _id: { $in: allMemberIds }
                }).select('displayName email profilePicture isOnline lastSeen clubsJoined stats');
                console.log(`[Members] Fallback found ${members.length} members`);
            }
        }

        // Fetch all meetings for all clubs joined by these members to calculate stats
        const allMemberClubIds = [...new Set(members.flatMap(m => m.clubsJoined.map(c => c.clubId.toString())))];
        const allMeetings = await Meeting.find({
            clubId: { $in: allMemberClubIds },
            status: { $in: ['completed', 'ongoing'] }
        }).sort('-date');

        const enhancedMembers = members.map(member => {
            const memberObj = member.toObject();

            // Calculate stats for EACH club the member has joined
            const allClubStats = member.clubsJoined.map(joinedClub => {
                const cId = joinedClub.clubId.toString();
                const clubMeetings = allMeetings.filter(m =>
                    m.clubId.toString() === cId &&
                    m.attendees.some(a => a.userId.toString() === member._id.toString())
                );

                const attendedCount = clubMeetings.filter(m => {
                    const a = m.attendees.find(att => att.userId.toString() === member._id.toString());
                    return a && (a.status === 'present' || a.status === 'late');
                }).length;

                const history = allMeetings
                    .filter(m => m.clubId.toString() === cId)
                    .slice(0, 5)
                    .map(m => {
                        const record = m.attendees.find(a => a.userId.toString() === member._id.toString());
                        return {
                            name: m.name,
                            date: m.date,
                            status: record ? record.status : 'absent'
                        };
                    });

                return {
                    clubId: cId,
                    totalMeetings: clubMeetings.length,
                    attendedMeetings: attendedCount,
                    attendanceRate: clubMeetings.length > 0 ? (attendedCount / clubMeetings.length) * 100 : 0,
                    attendanceHistory: history
                };
            });

            // Keep the current club's stats as the primary ones for the list view
            const currentClubStats = allClubStats.find(s => s.clubId === clubId);

            memberObj.clubStats = currentClubStats || { attendanceRate: 0 };
            memberObj.allClubStats = allClubStats; // Array of stats for ALL their clubs

            return memberObj;
        });

        res.status(200).json({
            success: true,
            count: enhancedMembers.length,
            data: enhancedMembers
        });
    } catch (error) {
        console.error('Error fetching members:', error);
        res.status(500).json({
            success: false,
            message: 'Error fetching members'
        });
    }
});

// Join a club
router.post('/:clubId/join', protect, async (req, res) => {
    try {
        const { clubId } = req.params;
        const { accessKey } = req.body;
        const userId = req.user._id;

        const club = await Club.findById(clubId);
        if (!club) {
            return res.status(404).json({ success: false, message: 'Club not found' });
        }

        // Check if user already joined
        const alreadyJoined = await User.findOne({
            _id: userId,
            'clubsJoined.clubId': clubId
        });

        if (alreadyJoined) {
            return res.status(400).json({ success: false, message: 'Already a member of this club' });
        }

        // Validate access key
        const keyData = club.accessKeys.find(k => k.key === accessKey && k.isActive);
        if (!keyData) {
            return res.status(400).json({ success: false, message: 'Invalid or inactive access key' });
        }

        if (keyData.expiresAt && keyData.expiresAt < new Date()) {
            return res.status(400).json({ success: false, message: 'Access key has expired' });
        }

        if (keyData.maxUses && keyData.usedCount >= keyData.maxUses) {
            return res.status(400).json({ success: false, message: 'Access key usage limit reached' });
        }

        // Add user to club model
        club.members.push(userId);
        keyData.usedCount += 1;
        await club.save();

        // Add club to user model
        await User.findByIdAndUpdate(userId, {
            $push: {
                clubsJoined: {
                    clubId,
                    role: 'member',
                    joinedAt: new Date()
                }
            }
        });

        res.json({
            success: true,
            message: 'Successfully joined the club'
        });
    } catch (error) {
        console.error('Error joining club:', error);
        res.status(500).json({ success: false, message: 'Error joining club' });
    }
});

module.exports = router;

