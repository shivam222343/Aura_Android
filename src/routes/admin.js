const express = require('express');
const router = express.Router();
const { protect, authorize } = require('../middleware/auth');
const {
    getStats,
    getAllUsers,
    changeUserRole,
    sendCustomNotification,
    getGames,
    updateGameConfig,
    getAdmins
} = require('../controllers/adminController');
const { getClubAttendanceReport } = require('../controllers/attendanceReportController');

router.use(protect);

// Publicly available within protected area
router.get('/games', getGames);

router.use(authorize('admin')); // Restrict remaining routes to admin only

router.get('/stats', getStats);
router.get('/users', getAllUsers);
router.get('/admins', getAdmins);
router.put('/users/:id/role', changeUserRole);
router.post('/send-notification', sendCustomNotification);
router.post('/games', updateGameConfig);
router.get('/attendance-report/:clubId', getClubAttendanceReport);
router.get('/reports', (req, res) => res.json({ message: 'Reports placeholder' }));

module.exports = router;
