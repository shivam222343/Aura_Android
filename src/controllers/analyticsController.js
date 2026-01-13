const Meeting = require('../models/Meeting');
const Task = require('../models/Task');
const Club = require('../models/Club');
const Groq = require('groq-sdk');
const { redisClient } = require('../config/redis');

const groq = new Groq({
    apiKey: process.env.GROQ_API_KEY
});

// Cache duration: 5 minutes (300 seconds)
const CACHE_DURATION = 300;

/**
 * @desc    Get personal analytics and AI recommendations with Redis caching
 * @route   GET /api/analytics/personal
 * @access  Private
 */
exports.getPersonalAnalytics = async (req, res) => {
    try {
        const userId = req.user._id.toString();
        const cacheKey = `analytics:personal:${userId}`;

        // Try to get cached data first
        if (redisClient.isOpen) {
            try {
                const cachedData = await redisClient.get(cacheKey);
                if (cachedData) {
                    console.log('✅ Analytics served from cache for user:', userId);
                    return res.status(200).json({
                        success: true,
                        data: JSON.parse(cachedData),
                        cached: true
                    });
                }
            } catch (cacheError) {
                console.warn('Redis cache read error:', cacheError.message);
                // Continue to fetch fresh data if cache fails
            }
        }

        // Cache miss - fetch fresh data
        console.log('🔄 Fetching fresh analytics for user:', userId);

        // 1. Get Meeting Stats
        const meetings = await Meeting.find({
            'attendees.userId': userId,
            status: 'completed'
        }).lean(); // Use lean() for better performance

        const attendanceStats = meetings.map(m => {
            const attendee = m.attendees.find(a => a.userId.toString() === userId);
            return {
                date: m.date,
                status: attendee.status,
                name: m.name
            };
        });

        const totalMeetings = meetings.length;
        const presentCount = attendanceStats.filter(a => a.status === 'present').length;
        const attendedMeetings = presentCount;
        const attendanceRate = totalMeetings > 0 ? (presentCount / totalMeetings) * 100 : 0;

        // 2. Get Task Stats
        const tasks = await Task.find({
            'assignedTo.user': userId
        }).lean();

        const totalTasks = tasks.length;
        const completedTasks = tasks.filter(t => {
            const assignment = t.assignedTo.find(a => a.user.toString() === userId);
            return assignment && assignment.status === 'completed';
        }).length;
        const taskCompletionRate = totalTasks > 0 ? (completedTasks / totalTasks) * 100 : 0;

        // 3. Activity over time (Last 6 months)
        const sixMonthsAgo = new Date();
        sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 5);
        sixMonthsAgo.setDate(1);
        sixMonthsAgo.setHours(0, 0, 0, 0);

        const monthlyActivity = [];
        for (let i = 0; i < 6; i++) {
            const startOfMonth = new Date(sixMonthsAgo);
            startOfMonth.setMonth(sixMonthsAgo.getMonth() + i);

            const endOfMonth = new Date(startOfMonth);
            endOfMonth.setMonth(startOfMonth.getMonth() + 1);

            const monthLabel = startOfMonth.toLocaleString('default', { month: 'short' });

            // Count completed meetings in this month
            const monthMeetings = await Meeting.countDocuments({
                'attendees.userId': userId,
                'attendees.status': 'present',
                status: 'completed',
                date: { $gte: startOfMonth, $lt: endOfMonth }
            });

            // Count completed tasks in this month
            const monthTasks = await Task.countDocuments({
                'assignedTo': {
                    $elemMatch: {
                        user: userId,
                        status: 'completed',
                        completedAt: { $gte: startOfMonth, $lt: endOfMonth }
                    }
                }
            });

            monthlyActivity.push({
                month: monthLabel,
                meetings: monthMeetings,
                tasks: monthTasks
            });
        }

        // 4. Generate AI Recommendations using Groq (optional, can be cached separately)
        let recommendations = "Stay consistent with your tasks and meetings!";
        try {
            const prompt = `
                User Performance Report:
                - Name: ${req.user.displayName}
                - Attendance Rate: ${attendanceRate.toFixed(1)}%
                - Task Completion Rate: ${taskCompletionRate.toFixed(1)}%
                - Total Meetings Attended: ${presentCount}/${totalMeetings}
                - Total Tasks Completed: ${completedTasks}/${totalTasks}

                Based on this data, provide 3 short, professional, and motivating recommendations for the user to improve their club involvement and productivity. 
                Keep it under 100 tokens. Format as a bulleted list.
            `;

            const completion = await groq.chat.completions.create({
                messages: [{ role: 'user', content: prompt }],
                model: 'llama-3.3-70b-versatile',
                temperature: 0.7,
                max_tokens: 200,
            });

            recommendations = completion.choices[0]?.message?.content || recommendations;
        } catch (aiErr) {
            console.error('Groq Analytics Error:', aiErr);
        }

        const analyticsData = {
            summary: {
                attendanceRate: parseFloat(attendanceRate.toFixed(1)),
                taskCompletionRate: parseFloat(taskCompletionRate.toFixed(1)),
                totalMeetings,
                attendedMeetings,
                totalTasks,
                completedTasks
            },
            monthlyActivity,
            recommendations,
            attendanceHistory: attendanceStats.slice(-10).reverse()
        };

        // Cache the data for 5 minutes
        if (redisClient.isOpen) {
            try {
                await redisClient.setEx(cacheKey, CACHE_DURATION, JSON.stringify(analyticsData));
                console.log('💾 Analytics cached for user:', userId);
            } catch (cacheError) {
                console.warn('Redis cache write error:', cacheError.message);
                // Continue even if caching fails
            }
        }

        res.status(200).json({
            success: true,
            data: analyticsData,
            cached: false
        });

    } catch (error) {
        console.error('Analytics Fetch Error:', error);
        res.status(500).json({ success: false, message: 'Server error fetching analytics' });
    }
};

/**
 * @desc    Clear analytics cache for a user (useful after updates)
 * @route   POST /api/analytics/clear-cache
 * @access  Private
 */
exports.clearAnalyticsCache = async (req, res) => {
    try {
        const userId = req.user._id.toString();
        const cacheKey = `analytics:personal:${userId}`;

        await redis.del(cacheKey);

        res.status(200).json({
            success: true,
            message: 'Analytics cache cleared successfully'
        });
    } catch (error) {
        console.error('Cache Clear Error:', error);
        res.status(500).json({ success: false, message: 'Error clearing cache' });
    }
};
