const express = require('express');
const router = express.Router();
const {
    uploadImage,
    uploadBase64Image,
    getGalleryImages,
    updateImageStatus,
    toggleLike,
    addComment,
    getLikedUsers
} = require('../controllers/galleryController');
const { protect, authorize } = require('../middleware/auth');
const upload = require('../middleware/upload');

router.route('/')
    .get(getGalleryImages)
    .post(protect, upload.single('image'), uploadImage);

router.post('/upload-base64', protect, uploadBase64Image);
router.put('/:id/status', protect, authorize('admin'), updateImageStatus);
router.post('/:id/like', protect, toggleLike);
router.post('/:id/comment', protect, addComment);
router.get('/:id/likes', protect, getLikedUsers);

module.exports = router;
