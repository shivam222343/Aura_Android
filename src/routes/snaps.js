const express = require('express');
const router = express.Router();
const { protect } = require('../middleware/auth');
const { uploadMedia, handleMulterError } = require('../middleware/upload');
const {
    uploadSnap,
    uploadBase64Snap,
    getClubSnaps,
    getMySnaps,
    viewSnap,
    deleteSnap,
    getSnapViewers,
    updateSnapCaption,
    toggleLike
} = require('../controllers/snapController');

router.use(protect);

router.post('/', uploadMedia.single('file'), handleMulterError, uploadSnap);
router.post('/upload-base64', uploadBase64Snap);
router.get('/my-clubs', getMySnaps);
router.get('/club/:clubId', getClubSnaps);
router.post('/:snapId/view', viewSnap);
router.delete('/:snapId', deleteSnap);
router.get('/:snapId/viewers', getSnapViewers);
router.put('/:snapId/caption', updateSnapCaption);
router.post('/:snapId/like', toggleLike);

module.exports = router;
