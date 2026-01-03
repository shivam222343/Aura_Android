const Task = require('../models/Task');
const Notification = require('../models/Notification');
const { sendPushNotificationToMany } = require('../utils/pushNotifications');

/**
 * Checks for tasks with pending reminders and sends notifications
 * @param {object} app - Express app instance to get io
 */
const checkReminders = async (app) => {
    try {
        const now = new Date();
        // Find tasks with unsent reminders whose time has passed, and task is not fully completed
        const tasks = await Task.find({
            'reminders': {
                $elemMatch: {
                    sent: false,
                    time: { $lte: now }
                }
            },
            status: { $ne: 'completed' }
        });

        if (tasks.length === 0) return;

        console.log(`[ReminderService] Found ${tasks.length} tasks with pending reminders.`);

        for (const task of tasks) {
            // Find which specific reminders in the task are due
            const dueReminders = task.reminders.filter(r => !r.sent && r.time <= now);

            if (dueReminders.length === 0) continue;

            // Get users who haven't completed the task individually
            const pendingUserIds = task.assignedTo
                .filter(a => a.status === 'pending')
                .map(a => a.user.toString());

            if (pendingUserIds.length > 0) {
                // Determine reminder message based on the most recent due reminder type
                const latestReminder = dueReminders[dueReminders.length - 1];
                let messagePrefix = "Reminder: ";

                switch (latestReminder.type) {
                    case '1day': messagePrefix = "Deadline Tomorrow: "; break;
                    case '10hours': messagePrefix = "Due Today: "; break;
                    case '5hours': messagePrefix = "Clock is ticking: "; break;
                    case '2hours': messagePrefix = "Final Call: "; break;
                }

                const title = `${messagePrefix}${task.title}`;
                const body = `You have a pending task: "${task.title}". Deadline is ${new Date(task.dueDate).toLocaleString()}. Please complete it as soon as possible.`;

                // Create in-app notifications
                const notifs = pendingUserIds.map(userId => ({
                    userId,
                    type: 'task_reminder',
                    title,
                    message: body,
                    relatedId: task._id,
                    relatedModel: 'Task',
                    clubId: task.clubId
                }));

                try {
                    await Notification.insertMany(notifs);

                    // Send push notifications
                    await sendPushNotificationToMany(pendingUserIds, {
                        title: `📋 ${title}`,
                        body,
                        data: { taskId: task._id.toString(), type: 'task_reminder' }
                    });

                    // Emit socket event for each notified user to refresh their UI
                    const io = app.get('io');
                    if (io) {
                        pendingUserIds.forEach(uid => {
                            io.to(uid).emit('notification_receive', {});
                        });
                    }
                } catch (notifErr) {
                    console.error(`[ReminderService] Notification error for task ${task.title}:`, notifErr);
                }
            }

            // Mark ALL due reminders as sent (even if no users were pending, so we don't re-check them)
            dueReminders.forEach(r => {
                r.sent = true;
                r.sentAt = now;
            });

            // Use updateOne to avoid issues with middleware if we just want to save status
            // But we used task instance, so save() is fine and handles validation
            await task.save();
        }
    } catch (error) {
        console.error('[ReminderService] Error during reminder check:', error);
    }
};

/**
 * Initializes the reminder background service
 * @param {object} app - Express app instance
 */
const initReminderService = (app) => {
    // Run every 10 minutes (slightly more frequent for accuracy)
    setInterval(() => checkReminders(app), 10 * 60 * 1000);
    console.log('⏰ Task Reminder Service Initialized (Checking every 10 mins)');

    // Initial check after server starts
    setTimeout(() => checkReminders(app), 5000);
};

module.exports = { initReminderService };
