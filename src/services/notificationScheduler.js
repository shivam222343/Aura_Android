const cron = require('node-cron');
const User = require('../models/User');
const { sendPushNotification } = require('./pushNotification');

// Festival database (same as frontend)
const FESTIVALS = {
    '01-01': { name: "New Year's Day", emoji: '🎉', color: '#FFD700' },
    '01-14': { name: 'Makar Sankranti', emoji: '🪁', color: '#FF6B6B' },
    '01-26': { name: 'Republic Day', emoji: '🇮🇳', color: '#FF9933' },
    '02-14': { name: 'Valentine\'s Day', emoji: '❤️', color: '#FF1493' },
    '03-08': { name: 'Holi', emoji: '🎨', color: '#FF69B4' },
    '04-14': { name: 'Ambedkar Jayanti', emoji: '📚', color: '#4169E1' },
    '08-15': { name: 'Independence Day', emoji: '🇮🇳', color: '#FF9933' },
    '08-19': { name: 'Raksha Bandhan', emoji: '🎀', color: '#FF1493' },
    '08-26': { name: 'Janmashtami', emoji: '🦚', color: '#4169E1' },
    '09-05': { name: 'Teacher\'s Day', emoji: '👨‍🏫', color: '#4169E1' },
    '10-02': { name: 'Gandhi Jayanti', emoji: '🕊️', color: '#FF9933' },
    '10-24': { name: 'Diwali', emoji: '🪔', color: '#FFD700' },
    '11-14': { name: 'Children\'s Day', emoji: '👶', color: '#FF69B4' },
    '12-25': { name: 'Christmas', emoji: '🎄', color: '#DC143C' },
};

// Festival messages
const FESTIVAL_MESSAGES = {
    'Diwali': [
        '🪔 Happy Diwali! May your life be filled with light and prosperity! ✨',
        '✨ Wishing you a sparkling Diwali full of joy and happiness! 🪔',
        '🎆 May this Diwali bring endless moments of joy and love! 💫',
        '🪔 Light up your life with happiness this Diwali! 🌟',
        '✨ Have a blessed and prosperous Diwali! 🙏🪔'
    ],
    'Holi': [
        '🎨 Happy Holi! May your life be as colorful as the festival! 🌈',
        '🌈 Wishing you a vibrant and joyful Holi! 🎨',
        '💜 Let the colors of Holi spread happiness in your life! 🎨',
        '🎨 May this Holi paint your life with beautiful colors! 🌈',
        '🌈 Have a colorful and fun-filled Holi celebration! 🎨'
    ],
    'Christmas': [
        '🎄 Merry Christmas! May your day be merry and bright! ⭐',
        '⭐ Wishing you a magical Christmas filled with love! 🎅',
        '🎅 May Santa bring you lots of happiness this Christmas! 🎁',
        '🎄 Have a blessed and joyful Christmas! ⛄',
        '⭐ Sending you warm Christmas wishes and cheer! 🎄'
    ],
    'default': [
        '🎉 Happy {festival}! Wishing you joy and happiness! ✨',
        '✨ Celebrating {festival} with you! Have a great day! 🎊',
        '🎊 May {festival} bring you lots of blessings! 🙏',
        '🌟 Wishing you a wonderful {festival} celebration! 🎉',
        '🎉 Have an amazing {festival}! Enjoy the festivities! ✨'
    ]
};

// Birthday messages
const BIRTHDAY_MESSAGES = [
    '🎂 Happy Birthday {name}! May all your dreams come true! 🎉',
    '🎉 Wishing you the happiest birthday ever, {name}! 🎂',
    '🎈 Happy Birthday {name}! Have an amazing day ahead! 🎁',
    '🎁 It\'s your special day, {name}! Enjoy every moment! 🎂',
    '🎂 Happy Birthday {name}! May this year be your best yet! ✨',
];

// Notification times (IST timezone) - 5 times a day
const NOTIFICATION_TIMES = [
    '0 8 * * *',   // 8:00 AM
    '0 12 * * *',  // 12:00 PM
    '0 15 * * *',  // 3:00 PM
    '0 18 * * *',  // 6:00 PM
    '0 20 * * *'   // 8:00 PM
];

// Get random message
const getRandomMessage = (messages) => {
    return messages[Math.floor(Math.random() * messages.length)];
};

// Get festival message
const getFestivalMessage = (festivalName) => {
    const messages = FESTIVAL_MESSAGES[festivalName] || FESTIVAL_MESSAGES.default;
    const message = getRandomMessage(messages);
    return message.replace('{festival}', festivalName);
};

// Get birthday message
const getBirthdayMessage = (userName) => {
    const message = getRandomMessage(BIRTHDAY_MESSAGES);
    return message.replace('{name}', userName);
};

// Check for festivals today
const checkFestivalsToday = () => {
    const today = new Date();
    const month = String(today.getMonth() + 1).padStart(2, '0');
    const day = String(today.getDate()).padStart(2, '0');
    const dateKey = `${month}-${day}`;

    return FESTIVALS[dateKey] || null;
};

// Check for birthdays today
const checkBirthdaysToday = async () => {
    try {
        const today = new Date();
        const month = today.getMonth() + 1;
        const day = today.getDate();

        const users = await User.find({
            birthDate: { $exists: true, $ne: null },
            $expr: {
                $and: [
                    { $eq: [{ $month: '$birthDate' }, month] },
                    { $eq: [{ $dayOfMonth: '$birthDate' }, day] }
                ]
            }
        });

        return users;
    } catch (error) {
        console.error('Error checking birthdays:', error);
        return [];
    }
};

// Send festival notifications to all users
const sendFestivalNotifications = async (festival) => {
    try {
        const users = await User.find({
            pushToken: { $exists: true, $ne: null, $ne: '' }
        });

        console.log(`📢 Sending ${festival.name} notifications to ${users.length} users`);

        for (const user of users) {
            try {
                const message = getFestivalMessage(festival.name);
                await sendPushNotification(user.pushToken, {
                    title: `${festival.emoji} ${festival.name}`,
                    body: message,
                    data: { type: 'festival', festivalName: festival.name }
                });
            } catch (error) {
                console.error(`Failed to send notification to user ${user._id}:`, error.message);
            }
        }

        console.log(`✅ Festival notifications sent for ${festival.name}`);
    } catch (error) {
        console.error('Error sending festival notifications:', error);
    }
};

// Send birthday notifications
const sendBirthdayNotifications = async (users) => {
    try {
        console.log(`🎂 Sending birthday notifications to ${users.length} users`);

        for (const user of users) {
            if (user.pushToken) {
                try {
                    const name = user.fullName || user.displayName || 'Friend';
                    const message = getBirthdayMessage(name);
                    await sendPushNotification(user.pushToken, {
                        title: '🎂 Happy Birthday!',
                        body: message,
                        data: { type: 'birthday', userId: user._id.toString() }
                    });
                } catch (error) {
                    console.error(`Failed to send birthday notification to user ${user._id}:`, error.message);
                }
            }
        }

        console.log('✅ Birthday notifications sent');
    } catch (error) {
        console.error('Error sending birthday notifications:', error);
    }
};

// Main notification job
const runNotificationJob = async () => {
    try {
        console.log('🔔 Running notification job...');

        // Check for festivals
        const festival = checkFestivalsToday();
        if (festival) {
            console.log(`🎉 Today is ${festival.name}!`);
            await sendFestivalNotifications(festival);
        }

        // Check for birthdays
        const birthdayUsers = await checkBirthdaysToday();
        if (birthdayUsers.length > 0) {
            console.log(`🎂 ${birthdayUsers.length} birthdays today!`);
            await sendBirthdayNotifications(birthdayUsers);
        }

        if (!festival && birthdayUsers.length === 0) {
            console.log('📭 No festivals or birthdays today');
        }
    } catch (error) {
        console.error('❌ Notification job error:', error);
    }
};

// Schedule notifications
const scheduleNotifications = () => {
    console.log('⏰ Setting up notification scheduler...');

    NOTIFICATION_TIMES.forEach((time, index) => {
        cron.schedule(time, runNotificationJob, {
            timezone: 'Asia/Kolkata' // IST timezone
        });
        console.log(`✅ Scheduled notification ${index + 1}/5 at ${time}`);
    });

    console.log('🎯 Notification scheduler started successfully!');
    console.log('📅 Notifications will be sent 5 times daily at: 8 AM, 12 PM, 3 PM, 6 PM, 8 PM IST');
};

module.exports = {
    scheduleNotifications,
    runNotificationJob // Export for manual testing
};
