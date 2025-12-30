const express = require('express');
const router = express.Router();
const { protect } = require('../middleware/auth');

const {
    createTask,
    getTasks,
    updateTaskStatus,
    deleteTask
} = require('../controllers/taskController');
const { authorize } = require('../middleware/auth');

router.get('/', protect, getTasks);
router.post('/', protect, authorize('admin', 'subadmin'), createTask);
router.put('/:id/status', protect, updateTaskStatus);
router.delete('/:id', protect, authorize('admin', 'subadmin'), deleteTask);

module.exports = router;
