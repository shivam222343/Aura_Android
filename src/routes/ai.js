const express = require('express');
const router = express.Router();
const multer = require('multer');
const { transcribeAudio } = require('../controllers/transcribeController');
const { protect } = require('../middleware/auth');

// Multer storage for buffer
const storage = multer.memoryStorage();
const upload = multer({ storage });

router.post('/transcribe', protect, upload.single('audio'), transcribeAudio);

module.exports = router;
