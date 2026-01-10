const { redisClient } = require('../config/redis');

/**
 * Cache utility for Redis
 * Provides resilient caching that falls back gracefully if Redis is not connected
 */

const getCache = async (key) => {
    try {
        if (!redisClient.isOpen) return null;
        const data = await redisClient.get(key);
        return data ? JSON.parse(data) : null;
    } catch (error) {
        console.error(`Cache Get Error [${key}]:`, error);
        return null;
    }
};

const setCache = async (key, value, ttl = 3600) => {
    try {
        if (!redisClient.isOpen) return false;
        await redisClient.set(key, JSON.stringify(value), {
            EX: ttl // Time to live in seconds
        });
        return true;
    } catch (error) {
        console.error(`Cache Set Error [${key}]:`, error);
        return false;
    }
};

const delCache = async (key) => {
    try {
        if (!redisClient.isOpen) return false;
        await redisClient.del(key);
        return true;
    } catch (error) {
        console.error(`Cache Delete Error [${key}]:`, error);
        return false;
    }
};

// Patterns: e.g., "user:profile:*"
const delCacheByPattern = async (pattern) => {
    try {
        if (!redisClient.isOpen) return false;
        const keys = await redisClient.keys(pattern);
        if (keys.length > 0) {
            await redisClient.del(keys);
        }
        return true;
    } catch (error) {
        console.error(`Cache Pattern Delete Error [${pattern}]:`, error);
        return false;
    }
};

module.exports = {
    getCache,
    setCache,
    delCache,
    delCacheByPattern
};
