const express = require('express');
const router = express.Router();
const customFormController = require('../controllers/customFormController');
const { protect, authorize } = require('../middleware/auth');

const { uploadImage, handleMulterError } = require('../middleware/upload');

// Public routes
router.get('/:id', customFormController.getForm);
router.post('/submit', customFormController.submitResponse);
router.post('/upload', uploadImage.single('file'), handleMulterError, customFormController.uploadFile);

// Protected routes (Admin only)
router.use(protect);
router.use(authorize('admin'));

router.post('/', customFormController.createForm);
router.get('/admin/all', customFormController.getAdminForms);
router.put('/:id', customFormController.updateForm);
router.delete('/:id', customFormController.deleteForm);
router.get('/:id/responses', customFormController.getResponses);
router.delete('/response/:responseId', customFormController.deleteResponse);
router.get('/:id/analytics', customFormController.getFormAnalytics);

module.exports = router;
