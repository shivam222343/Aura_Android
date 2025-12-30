const express = require('express');
const router = express.Router();
const {
    uploadImage,
    getGalleryImages,
    updateImageStatus,
    toggleLike,
    addComment,
    updateImage,
    deleteImage,
    getLikedUsers
} = require('../controllers/galleryController');
const { protect, authorize } = require('../middleware/auth');
const { uploadImage: uploadMiddleware } = require('../middleware/upload');

router.route('/')
    .get(protect, getGalleryImages)
    .post(protect, uploadMiddleware.single('image'), uploadImage);

router.route('/:id')
    .put(protect, updateImage)
    .delete(protect, deleteImage);

router.put('/:id/status', protect, authorize('admin'), updateImageStatus);
router.post('/:id/like', protect, toggleLike);
router.post('/:id/comment', protect, addComment);
router.get('/:id/likes', protect, getLikedUsers);

module.exports = router;
