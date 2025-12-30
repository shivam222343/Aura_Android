const express = require('express');
const router = express.Router();
const {
    signup,
    signin,
    logout,
    getMe,
    updateProfile,
    uploadProfilePicture,
    changePassword,
    updateFCMToken,
    getDashboardData
} = require('../controllers/authController');

const { protect } = require('../middleware/auth');
const { uploadImage, handleMulterError } = require('../middleware/upload');

// Public routes
router.post('/signup', signup);
router.post('/signin', signin);

// Protected routes
router.use(protect);

router.get('/dashboard', getDashboardData);

router.post('/logout', logout);
router.get('/me', getMe);
router.put('/update-profile', updateProfile);
router.post('/upload-profile-picture', uploadImage.single('image'), handleMulterError, uploadProfilePicture);
router.put('/change-password', changePassword);
router.put('/fcm-token', updateFCMToken);

module.exports = router;
