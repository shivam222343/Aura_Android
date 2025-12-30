const express = require('express');
const router = express.Router();
const { protect } = require('../middleware/auth');
const { uploadImage, handleMulterError } = require('../middleware/upload');
const {
    uploadSnap,
    getClubSnaps,
    viewSnap,
    deleteSnap,
    getSnapViewers,
    updateSnapCaption
} = require('../controllers/snapController');

router.use(protect);

router.post('/', uploadImage.single('image'), handleMulterError, uploadSnap);
router.get('/club/:clubId', getClubSnaps);
router.post('/:snapId/view', viewSnap);
router.delete('/:snapId', deleteSnap);
router.get('/:snapId/viewers', getSnapViewers);
router.put('/:snapId/caption', updateSnapCaption);

module.exports = router;
