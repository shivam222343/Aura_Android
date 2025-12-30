const express = require('express');
const router = express.Router();
const { protect } = require('../middleware/auth');
const {
    createMeeting,
    updateMeeting,
    deleteMeeting,
    getClubMeetings,
    startAttendance,
    markAttendance,
    manualAttendance,
    getMeetingDetails,
    updateMeetingStatus
} = require('../controllers/meetingController');

// ...
// Update a meeting status
router.put('/:id/status', protect, updateMeetingStatus);

// Create a meeting
router.post('/', protect, createMeeting);

// Update a meeting
router.put('/:id', protect, updateMeeting);

// Delete a meeting
router.delete('/:id', protect, deleteMeeting);

// Get meetings for a specific club
router.get('/club/:clubId', protect, getClubMeetings);

// Get specific meeting details
router.get('/:id', protect, getMeetingDetails);

// Start attendance (Generate Code)
router.post('/:id/attendance-start', protect, startAttendance);

// Mark attendance (User)
router.post('/:id/attendance', protect, markAttendance);

// Mark attendance (Admin manual)
router.post('/:id/manual-attendance', protect, manualAttendance);

module.exports = router;
