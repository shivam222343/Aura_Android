const { createClient } = require('redis');

const redisClient = createClient({
    url: process.env.REDIS_URL || 'redis://localhost:6379'
});

redisClient.on('error', (err) => {
    console.error('Redis Client Error:', err);
    // Ensure we don't crash the server if Redis isn't running
});

redisClient.on('connect', () => {
    console.log('Redis connected successfully');
});

const connectRedis = async () => {
    try {
        await redisClient.connect();
    } catch (error) {
        console.error('Could not connect to Redis:', error.message);
        console.log('App will continue without Redis caching.');
    }
};

module.exports = {
    redisClient,
    connectRedis
};
