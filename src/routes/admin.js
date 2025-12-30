const express = require('express');
const router = express.Router();
const { protect, authorize } = require('../middleware/auth');
const {
    getStats,
    getAllUsers,
    changeUserRole
} = require('../controllers/adminController');

router.use(protect);
router.use(authorize('admin')); // Restrict all routes to admin only

router.get('/stats', getStats);
router.get('/users', getAllUsers);
router.put('/users/:id/role', changeUserRole);
router.get('/reports', (req, res) => res.json({ message: 'Reports placeholder' }));

module.exports = router;
