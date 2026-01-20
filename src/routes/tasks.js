const express = require('express');
const router = express.Router();
const { protect } = require('../middleware/auth');

const {
    createTask,
    getTasks,
    updateTaskStatus,
    updateTask,
    deleteTask
} = require('../controllers/taskController');
const { authorize } = require('../middleware/auth');

router.get('/', protect, getTasks);
router.post('/', protect, authorize('admin', 'subadmin'), createTask);
router.put('/:id/status', protect, updateTaskStatus);
router.put('/:id', protect, authorize('admin', 'subadmin'), updateTask);
router.delete('/:id', protect, authorize('admin', 'subadmin'), deleteTask);

module.exports = router;
