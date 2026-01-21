const express = require('express');
const router = express.Router();
const resourceController = require('../controllers/resourceController');
const { protect } = require('../middleware/auth');

router.get('/event/:eventId', protect, resourceController.getResources);
router.post('/link', protect, resourceController.addLink);
router.post('/upload', protect, resourceController.uploadFile);
router.put('/:id', protect, resourceController.updateResource);
router.delete('/:id', protect, resourceController.deleteResource);

module.exports = router;
