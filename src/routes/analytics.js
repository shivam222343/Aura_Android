const express = require('express');
const router = express.Router();
const { getPersonalAnalytics } = require('../controllers/analyticsController');
const { protect } = require('../middleware/auth');

router.get('/personal', protect, getPersonalAnalytics);

module.exports = router;
