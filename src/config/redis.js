const { createClient } = require('redis');

const redisClient = createClient({
    url: process.env.REDIS_URL || 'redis://localhost:6379',
    socket: {
        reconnectStrategy: false // Disable auto-reconnect for local dev
    }
});

redisClient.on('error', (err) => {
    // Silently handle errors when Redis is not available
    if (err.code !== 'ECONNREFUSED') {
        console.error('Redis Client Error:', err.message);
    }
});

redisClient.on('connect', () => {
    console.log('✅ Redis connected successfully');
});

const connectRedis = async () => {
    try {
        await redisClient.connect();
    } catch (error) {
        console.log('⚠️  Redis not available - continuing without cache');
        // Don't log the full error to keep console clean
    }
};

module.exports = {
    redisClient,
    connectRedis
};
