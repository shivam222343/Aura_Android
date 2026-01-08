const express = require('express');
const router = express.Router();
const { renderUploadPage, handleWebUpload, handleBase64Upload } = require('../controllers/webUploadController');
const { protect } = require('../middleware/auth');
const { uploadImage, handleMulterError } = require('../middleware/upload');

// Page rendering (public access with token check inside)
router.get('/', renderUploadPage);

// API upload (protected)
router.post('/', protect, uploadImage.single('file'), handleMulterError, handleWebUpload);
router.post('/base64', protect, handleBase64Upload);

module.exports = router;
