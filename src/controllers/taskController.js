const Task = require('../models/Task');
const User = require('../models/User');
const Notification = require('../models/Notification');
const { sendPushNotificationToMany } = require('../utils/pushNotifications');
const { getCache, setCache, delCache } = require('../utils/cache');

/**
 * @desc    Create a new task
 * @route   POST /api/tasks
 * @access  Private/Admin
 */
exports.createTask = async (req, res) => {
    try {
        const { title, description, clubId, assignedTo, dueDate, priority, meetingId, attachments } = req.body;

        if (!assignedTo || !Array.isArray(assignedTo) || assignedTo.length === 0) {
            return res.status(400).json({ success: false, message: 'At least one assignee is required' });
        }

        // Prepare assignedTo array for model
        const assignees = assignedTo.map(userId => ({
            user: userId,
            status: 'pending'
        }));

        const task = await Task.create({
            title,
            description,
            clubId,
            assignedTo: assignees,
            dueDate,
            priority,
            meetingId,
            attachments,
            assignedBy: req.user._id
        });

        // Notify assignees
        try {
            const notifs = assignedTo.map(userId => ({
                userId,
                type: 'task_assigned',
                title: 'New Task Assigned',
                message: `You have been assigned a new task: ${title}`,
                relatedId: task._id,
                relatedModel: 'Task'
            }));
            await Notification.insertMany(notifs);

            await sendPushNotificationToMany(assignedTo, {
                title: 'New Task Assigned 📋',
                body: `New task: ${title}. Due by ${new Date(dueDate).toLocaleDateString()}`,
                data: { taskId: task._id.toString() }
            });

            // Real-time socket signal
            const io = req.app.get('io');
            if (io) {
                // Signal each attendee for the notification badge
                assignedTo.forEach(userId => {
                    io.to(userId.toString()).emit('notification_receive', {});
                });

                // Broadcast task update to the club room
                const populatedNewTask = await Task.findById(task._id)
                    .populate('assignedTo.user', 'displayName profilePicture')
                    .populate('assignedBy', 'displayName')
                    .populate('meetingId', 'name date');
                io.to(`club:${task.clubId}`).emit('task_update', populatedNewTask);
            }
        } catch (notifErr) {
            console.error('Task notification error:', notifErr);
        }

        // Invalidate caches for all assignees and the dashboard
        for (const userId of assignedTo) {
            await delCache(`user:tasks:${userId}`);
            await delCache(`user:dashboard:${userId}`);
        }

        res.status(201).json({ success: true, data: task });
    } catch (error) {
        console.error('Create task error:', error);
        res.status(500).json({ success: false, message: 'Server error' });
    }
};

/**
 * @desc    Get all tasks for a club or user
 * @route   GET /api/tasks
 * @access  Private
 */
exports.getTasks = async (req, res) => {
    try {
        const { clubId, status } = req.query;
        let query = {};

        if (clubId) query.clubId = clubId;

        // If not admin, only show tasks assigned to the user
        if (req.user.role !== 'admin') {
            query['assignedTo.user'] = req.user._id;
        }

        const cacheKey = `user:tasks:${req.user._id}:${clubId || 'all'}`;
        const cachedTasks = await getCache(cacheKey);

        if (cachedTasks) {
            return res.status(200).json({
                success: true,
                data: cachedTasks,
                source: 'cache'
            });
        }

        const tasks = await Task.find(query)
            .populate('assignedTo.user', 'displayName profilePicture')
            .populate('assignedBy', 'displayName')
            .populate('meetingId', 'name date')
            .sort({ dueDate: 1 });

        await setCache(cacheKey, tasks, 1800); // Cache for 30 mins

        res.status(200).json({
            success: true,
            data: tasks,
            source: 'database'
        });
    } catch (error) {
        res.status(500).json({ success: false, message: 'Server error' });
    }
};

/**
 * @desc    Update task status (by assignee)
 * @route   PUT /api/tasks/:id/status
 * @access  Private
 */
exports.updateTaskStatus = async (req, res) => {
    try {
        const { status } = req.body;
        const task = await Task.findById(req.params.id);

        if (!task) {
            return res.status(404).json({ success: false, message: 'Task not found' });
        }

        // Find the specific assignment for this user
        const assignment = task.assignedTo.find(a => a.user.toString() === req.user._id.toString());

        if (!assignment) {
            return res.status(403).json({ success: false, message: 'You are not assigned to this task' });
        }

        assignment.status = status;
        if (status === 'completed') {
            assignment.completedAt = new Date();
        }

        // If all assignees finished, maybe mark overall task as completed
        const allDone = task.assignedTo.every(a => a.status === 'completed');
        if (allDone) {
            task.status = 'completed';
            task.completedAt = new Date();
        } else {
            task.status = 'in-progress';
        }

        await task.save();

        // Populate to ensure UI has user data
        const populatedTask = await Task.findById(task._id)
            .populate('assignedTo.user', 'displayName profilePicture')
            .populate('assignedBy', 'displayName')
            .populate('meetingId', 'name date');

        // Emit socket event for real-time updates
        const io = req.app.get('io');
        if (io) {
            io.to(`club:${task.clubId}`).emit('task_update', populatedTask);
        }

        // Invalidate caches
        await delCache(`user:tasks:${req.user._id}:${task.clubId}`);
        await delCache(`user:tasks:${req.user._id}:all`);
        await delCache(`user:dashboard:${req.user._id}`);

        res.status(200).json({ success: true, data: populatedTask });
    } catch (error) {
        console.error('Update task status error:', error);
        res.status(500).json({ success: false, message: 'Server error' });
    }
};

/**
 * @desc    Delete task
 * @route   DELETE /api/tasks/:id
 * @access  Private/Admin
 */
exports.deleteTask = async (req, res) => {
    try {
        const task = await Task.findById(req.params.id);
        if (!task) return res.status(404).json({ success: false, message: 'Task not found' });

        // Check if admin, subadmin or the one who assigned it
        const canDelete = req.user.role === 'admin' ||
            req.user.role === 'subadmin' ||
            task.assignedBy.toString() === req.user._id.toString();

        if (!canDelete) {
            return res.status(403).json({ success: false, message: 'Not authorized' });
        }

        const clubId = task.clubId;
        const taskId = task._id;
        await task.deleteOne();

        // Invalidate caches (Best effort, usually for the club)
        // Since we don't know all assignees easily here without keeping them in memory,
        // it will expire naturally or we could loop if needed.
        // For now, let's just clear the dashboard for the one who deleted it if they were assigned too.
        await delCache(`user:dashboard:${req.user._id}`);

        res.status(200).json({ success: true, message: 'Task removed' });

        // Emit socket event for real-time deletion
        const io = req.app.get('io');
        if (io) {
            io.to(`club:${clubId}`).emit('task_deleted', { taskId: taskId.toString() });
        }
    } catch (error) {
        res.status(500).json({ success: false, message: 'Server error' });
    }
};
