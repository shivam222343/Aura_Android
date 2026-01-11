const Task = require('../models/Task');
const Meeting = require('../models/Meeting');
const Notification = require('../models/Notification');
const { sendPushNotificationToMany, sendClubPushNotification } = require('../utils/pushNotifications');

/**
 * Checks for tasks and meetings with pending reminders and sends notifications
 * @param {object} app - Express app instance to get io
 */
const checkReminders = async (app) => {
    const now = new Date();

    // 1. Task Reminders (Original Logic)
    try {
        const tasks = await Task.find({
            'reminders': {
                $elemMatch: {
                    sent: false,
                    time: { $lte: now }
                }
            },
            status: { $ne: 'completed' }
        });

        for (const task of tasks) {
            const dueReminders = task.reminders.filter(r => !r.sent && r.time <= now);
            if (dueReminders.length === 0) continue;

            const pendingUserIds = task.assignedTo
                .filter(a => a.status === 'pending')
                .map(a => a.user.toString());

            if (pendingUserIds.length > 0) {
                const latestReminder = dueReminders[dueReminders.length - 1];
                let messagePrefix = "Reminder: ";
                switch (latestReminder.type) {
                    case '1day': messagePrefix = "Deadline Tomorrow: "; break;
                    case '10hours': messagePrefix = "Due Today: "; break;
                    case '5hours': messagePrefix = "Clock is ticking: "; break;
                    case '2hours': messagePrefix = "Final Call: "; break;
                }

                const title = `${messagePrefix}${task.title}`;
                const body = `You have a pending task: "${task.title}". Deadline is ${new Date(task.dueDate).toLocaleString()}.`;

                await Notification.insertMany(pendingUserIds.map(userId => ({
                    userId,
                    type: 'task_reminder',
                    title,
                    message: body,
                    relatedId: task._id,
                    relatedModel: 'Task',
                    clubId: task.clubId
                })));

                await sendPushNotificationToMany(pendingUserIds, {
                    title: `📋 ${title}`,
                    body,
                    data: { screen: 'Tasks', params: { focusTaskId: task._id.toString() }, taskId: task._id.toString(), type: 'task_reminder' }
                }, app);

                const io = app.get('io');
                if (io) pendingUserIds.forEach(uid => io.to(uid).emit('notification_receive', {}));
            }

            dueReminders.forEach(r => { r.sent = true; r.sentAt = now; });
            await task.save();
        }
    } catch (err) {
        console.error('[ReminderService] Task reminder error:', err);
    }

    // 2. Meeting Reminders (New Logic - 10m and 5m before)
    try {
        const reminderWindows = [10, 5];
        for (const minsBefore of reminderWindows) {
            // Find meetings on this date
            const targetTime = new Date(now.getTime() + minsBefore * 60000);
            const startOfDay = new Date(targetTime); startOfDay.setHours(0, 0, 0, 0);
            const endOfDay = new Date(targetTime); endOfDay.setHours(23, 59, 59, 999);

            const meetings = await Meeting.find({
                date: { $gte: startOfDay, $lte: endOfDay },
                status: 'upcoming'
            }).populate('clubId', 'name');

            for (const meeting of meetings) {
                if (!meeting.time) continue;
                const [hrs, mins] = meeting.time.split(':').map(Number);
                if (isNaN(hrs) || isNaN(mins)) continue;

                const meetingStartTime = new Date(meeting.date);
                meetingStartTime.setHours(hrs, mins, 0, 0);

                const diffInMins = Math.round((meetingStartTime.getTime() - now.getTime()) / 60000);

                if (diffInMins === minsBefore) {
                    console.log(`[ReminderService] Sending ${minsBefore}m reminder for: ${meeting.name}`);

                    await sendClubPushNotification(
                        meeting.clubId._id,
                        `Meeting Starting Soon! ⏳`,
                        `"${meeting.name}" starts in ${minsBefore} minutes at ${meeting.time}.`,
                        {
                            type: 'meeting_reminder',
                            screen: 'Calendar',
                            params: { selectedMeetingId: meeting._id.toString(), clubId: meeting.clubId._id.toString() },
                            meetingId: meeting._id.toString()
                        },
                        app
                    );

                    const io = app.get('io');
                    if (io) io.to(`club:${meeting.clubId._id}`).emit('notification_receive', {});
                }
            }
        }
    } catch (err) {
        console.error('[ReminderService] Meeting reminder error:', err);
    }

    // 3. Auto-complete Past Meetings
    try {
        const meetingsToComplete = await Meeting.find({
            status: { $in: ['upcoming', 'ongoing'] },
            date: { $lte: now }
        });

        for (const meeting of meetingsToComplete) {
            if (!meeting.time) continue;
            const [hrs, mins] = meeting.time.split(':').map(Number);
            if (isNaN(hrs) || isNaN(mins)) continue;

            const meetingEndTime = new Date(meeting.date);
            meetingEndTime.setHours(hrs, mins, 0, 0);

            // 3 hour buffer
            const threeHoursInMs = 3 * 60 * 60 * 1000;

            if (now.getTime() > (meetingEndTime.getTime() + threeHoursInMs)) {
                meeting.status = 'completed';
                await meeting.save();
                console.log(`[ReminderService] Auto-completed meeting: ${meeting.name}`);

                // Invalidate cache
                const { delCache } = require('../utils/cache');
                await delCache(`club:meetings:${meeting.clubId}`);

                // Emit socket event to move it to past section in realtime
                const io = app.get('io');
                if (io) {
                    io.to(`club:${meeting.clubId}`).emit('meeting_status_updated', {
                        clubId: meeting.clubId.toString(),
                        meetingId: meeting._id.toString(),
                        status: 'completed'
                    });
                }
            }
        }
    } catch (err) {
        console.error('[ReminderService] Auto-complete error:', err);
    }
};

const initReminderService = (app) => {
    // Run every minute for precision
    setInterval(() => checkReminders(app), 60 * 1000);
    console.log('⏰ Reminder Service Initialized (Checking Tasks & Meetings every min)');
    setTimeout(() => checkReminders(app), 5000);
};

module.exports = { initReminderService };
