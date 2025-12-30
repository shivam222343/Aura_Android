const express = require('express');
const router = express.Router();
const { getBirthdaysToday } = require('../controllers/userController');
const { protect } = require('../middleware/auth');

// Get birthdays today
router.get('/birthdays-today', protect, getBirthdaysToday);

module.exports = router;
