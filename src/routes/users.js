const express = require('express');
const router = express.Router();
const { getBirthdaysToday, saveFCMToken, removeFCMToken } = require('../controllers/userController');
const { protect } = require('../middleware/auth');

// Get birthdays today
router.get('/birthdays-today', protect, getBirthdaysToday);

// FCM Token Management
router.put('/fcm-token', protect, saveFCMToken);
router.delete('/fcm-token', protect, removeFCMToken);

module.exports = router;
