const express = require('express');
const router = express.Router();
const { protect } = require('../middleware/auth');
const { uploadMedia, handleMulterError } = require('../middleware/upload');
const {
    uploadSnap,
    getClubSnaps,
    getMySnaps,
    viewSnap,
    deleteSnap,
    getSnapViewers,
    updateSnapCaption
} = require('../controllers/snapController');

router.use(protect);

router.post('/', uploadMedia.single('image'), handleMulterError, uploadSnap);
router.get('/my-clubs', getMySnaps);
router.get('/club/:clubId', getClubSnaps);
router.post('/:snapId/view', viewSnap);
router.delete('/:snapId', deleteSnap);
router.get('/:snapId/viewers', getSnapViewers);
router.put('/:snapId/caption', updateSnapCaption);

module.exports = router;
