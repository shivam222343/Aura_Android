const express = require('express');
const router = express.Router();
const customFormController = require('../controllers/customFormController');
const { protect, admin } = require('../middleware/auth');

// Public routes
router.get('/:id', customFormController.getForm);
router.post('/submit', customFormController.submitResponse);

// Protected routes (Admin only)
router.use(protect);
router.use(admin);

router.post('/', customFormController.createForm);
router.get('/admin/all', customFormController.getAdminForms);
router.put('/:id', customFormController.updateForm);
router.delete('/:id', customFormController.deleteForm);
router.get('/:id/responses', customFormController.getResponses);

module.exports = router;
