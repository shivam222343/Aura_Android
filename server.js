require('dotenv').config(); // Loaded environment variables (Updated for Sidebar)
const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const cors = require('cors');
const helmet = require('helmet');
const compression = require('compression');
const rateLimit = require('express-rate-limit');
const morgan = require('morgan');
const connectDB = require('./src/config/database');
const { sendPushNotification } = require('./src/utils/pushNotifications');
const { initReminderService } = require('./src/services/reminderService');
const { connectRedis } = require('./src/config/redis');

// Initialize Express app
const app = express();
const server = http.createServer(app);

// Initialize Socket.io
const io = socketIo(server, {
    cors: {
        origin: true,
        methods: ['GET', 'POST'],
        credentials: true
    }
});

// Connect to MongoDB and Redis
connectDB();
connectRedis();

// CORS - Must be before other middleware that might return early
app.use(cors({
    origin: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS', 'PATCH'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With', 'Accept'],
    credentials: true,
    preflightContinue: false,
    optionsSuccessStatus: 204
}));

// Middleware
app.use(helmet({
    crossOriginResourcePolicy: { policy: "cross-origin" },
    crossOriginEmbedderPolicy: false
}));
app.use(morgan('dev'));
app.use(compression());

// Request logging for debugging Android reachability
app.use((req, res, next) => {
    console.log(`[${new Date().toISOString()}] ${req.method} ${req.url}`);
    if (req.method === 'POST' && req.headers['content-type']?.includes('multipart/form-data')) {
        console.log('Incoming Multipart Request - Content-Length:', req.headers['content-length']);
    }
    next();
});

app.use(express.json({ limit: '200mb' }));
app.use(express.urlencoded({ extended: true, limit: '200mb' }));

// Rate limiting
const limiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 1000, // Increased limit for development/active polling
    message: 'Too many requests from this IP, please try again later.'
});
app.use('/api/', limiter);

// Make io accessible to routes
app.set('io', io);

// Routes
app.get('/', (req, res) => {
    res.json({
        message: 'Mavericks Club Management API',
        version: '1.0.0',
        status: 'running'
    });
});

// API Routes
app.use('/api/auth', require('./src/routes/auth'));
app.use('/api/clubs', require('./src/routes/clubs'));
app.use('/api/meetings', require('./src/routes/meetings'));
app.use('/api/members', require('./src/routes/members'));
app.use('/api/tasks', require('./src/routes/tasks'));
app.use('/api/notifications', require('./src/routes/notifications'));
app.use('/api/messages', require('./src/routes/messages'));
app.use('/api/gallery', require('./src/routes/gallery'));
app.use('/api/snaps', require('./src/routes/snaps'));
app.use('/api/admin', require('./src/routes/admin'));
app.use('/api/analytics', require('./src/routes/analytics'));
app.use('/api/users', require('./src/routes/users'));
app.use('/api/group-chat', require('./src/routes/groupChat'));
app.use('/api/web-upload', require('./src/routes/webUpload'));
app.use('/api/notes', require('./src/routes/notes'));
app.use('/api/events', require('./src/routes/eventRoutes'));
app.use('/api/resources', require('./src/routes/resourceRoutes'));

// Socket.io connection handling
io.on('connection', (socket) => {
    console.log(`✅ User connected: ${socket.id}`);

    // Join user-specific room
    socket.on('user:online', async (userId) => {
        socket.join(userId);
        socket.userId = userId;

        try {
            const User = require('./src/models/User');
            const user = await User.findById(userId);
            if (user) {
                socket.userDisplayName = user.displayName;
                socket.userProfilePicture = user.profilePicture;
            }

            const now = new Date();
            await User.findByIdAndUpdate(userId, {
                isOnline: true,
                lastSeen: now
            });
            socket.broadcast.emit('user:status', { userId, isOnline: true, lastSeen: now });
            console.log(`👤 User ${userId} (${user?.displayName || 'Unknown'}) is now online`);
        } catch (error) {
            console.error('Error updating user online status:', error);
        }
    });

    // Join club rooms
    socket.on('club:join', (clubId) => {
        socket.join(`club:${clubId}`);
        console.log(`🏢 User ${socket.userId} joined club room: ${clubId}`);
    });

    // Send message (Legacy/Fallback - preferably use REST API for persistence)
    socket.on('message:send', async (data) => {
        const { receiverId, message, senderName } = data;
        io.to(receiverId).emit('message:receive', message);
    });

    // Delete message (Real-time sync)
    socket.on('message:delete', (data) => {
        const { receiverId, messageId, type } = data;
        io.to(receiverId).emit('message:delete', { messageId, type });
    });

    // Reaction (Real-time sync)
    socket.on('message:reaction', (data) => {
        const { receiverId, messageId, reactions } = data;
        io.to(receiverId).emit('message:reaction', { messageId, reactions });
    });

    /**
     * Maverick Games Socket Handlers
     */
    require('./src/sockets/gameSocket')(io, socket);
    require('./src/sockets/noteSocket')(io, socket);

    // Explicit offline
    socket.on('user:offline', async (userId) => {
        try {
            const User = require('./src/models/User');
            const now = new Date();
            await User.findByIdAndUpdate(userId, {
                isOnline: false,
                lastSeen: now
            });
            socket.broadcast.emit('user:status', { userId, isOnline: false, lastSeen: now });
            console.log(`👤 User ${userId} is now offline (explicit)`);
        } catch (error) {
            console.error('Error updating user offline status:', error);
        }
    });

    // Typing indicator
    socket.on('message:typing', (data) => {
        const { receiverId, isTyping, senderId, clubId } = data;
        if (clubId) {
            // Group typing
            socket.to(`club:${clubId}`).emit('group:typing', { clubId, senderId, isTyping });
        } else {
            // Individual typing
            io.to(receiverId).emit('message:typing', { senderId, isTyping });
        }
    });

    // Send notification
    socket.on('notification:send', async (data) => {
        const { userId, notification } = data;
        io.to(userId).emit('notification:receive', notification);

        // Push notification for general update
        await sendPushNotification(
            userId,
            notification.title || 'Mavericks Update',
            notification.message || 'You have a new notification',
            { type: 'general_notification', ...notification }
        );
    });

    // Disconnect
    socket.on('disconnect', async () => {
        if (socket.userId) {
            try {
                const User = require('./src/models/User');
                const now = new Date();
                await User.findByIdAndUpdate(socket.userId, {
                    isOnline: false,
                    lastSeen: now
                });
                socket.broadcast.emit('user:status', { userId: socket.userId, isOnline: false, lastSeen: now });
                console.log(`👤 User ${socket.userId} is now offline`);
            } catch (error) {
                console.error('Error updating user offline status:', error);
            }
        }
        console.log(`❌ Socket disconnected: ${socket.id}`);
    });
});

// Error handling middleware
app.use((err, req, res, next) => {
    console.error('Error:', err);
    res.status(err.status || 500).json({
        success: false,
        message: err.message || 'Internal server error',
        ...(process.env.NODE_ENV === 'development' && { stack: err.stack })
    });
});

// 404 handler
app.use((req, res) => {
    res.status(404).json({
        success: false,
        message: 'Route not found'
    });
});

// Start server
const PORT = process.env.PORT || 5000;
server.listen(PORT, () => {
    console.log(`🚀 Server running on port ${PORT}`);
    console.log(`📱 Environment: ${process.env.NODE_ENV || 'development'}`);
    console.log(`🤖 Groq AI: ${process.env.GROQ_API_KEY ? 'Enabled ✅' : 'Disabled (Missing Key) ❌'}`);

    // Initialize background services
    initReminderService(app);
});

// Handle unhandled promise rejections
process.on('unhandledRejection', (err) => {
    console.error('Unhandled Promise Rejection:', err);
    server.close(() => process.exit(1));
});
