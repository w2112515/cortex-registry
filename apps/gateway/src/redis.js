/**
 * Redis Connection Module
 *
 * @description Redis client setup for Gateway caching layer
 * @see Task-12: Setup Fastify Redis
 */
import IORedisModule from 'ioredis';
// ESM compatibility: ioredis exports the class as default
const IORedis = IORedisModule;
/**
 * Default configuration from environment
 */
const defaultConfig = {
    host: process.env.REDIS_HOST || 'localhost',
    port: parseInt(process.env.REDIS_PORT || '6379'),
    password: process.env.REDIS_PASSWORD || undefined,
    db: parseInt(process.env.REDIS_DB || '0'),
    connectTimeout: 10000,
    maxRetriesPerRequest: 3,
    keyPrefix: 'cortex:',
};
// Singleton Redis client
let redisClient = null;
/**
 * Initialize Redis connection
 */
export async function initRedis(config = {}) {
    const mergedConfig = { ...defaultConfig, ...config };
    if (redisClient) {
        return redisClient;
    }
    // Build options, only include defined values
    const options = {
        host: mergedConfig.host,
        port: mergedConfig.port,
        lazyConnect: true,
        retryStrategy: (times) => {
            if (times > 3) {
                console.error('[Redis] Max retries reached, giving up');
                return null;
            }
            const delay = Math.min(times * 100, 3000);
            console.log(`[Redis] Retrying connection in ${delay}ms...`);
            return delay;
        },
    };
    // Only add optional properties if defined
    if (mergedConfig.password)
        options.password = mergedConfig.password;
    if (mergedConfig.db !== undefined)
        options.db = mergedConfig.db;
    if (mergedConfig.connectTimeout !== undefined)
        options.connectTimeout = mergedConfig.connectTimeout;
    if (mergedConfig.maxRetriesPerRequest !== undefined)
        options.maxRetriesPerRequest = mergedConfig.maxRetriesPerRequest;
    if (mergedConfig.keyPrefix)
        options.keyPrefix = mergedConfig.keyPrefix;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const client = new IORedis(options);
    client.on('connect', () => {
        console.log('[Redis] Connected successfully');
    });
    client.on('error', (err) => {
        console.error('[Redis] Connection error:', err.message);
    });
    client.on('close', () => {
        console.log('[Redis] Connection closed');
    });
    await client.connect();
    redisClient = client;
    return client;
}
/**
 * Get existing Redis client
 */
export function getRedis() {
    if (!redisClient) {
        throw new Error('[Redis] Client not initialized. Call initRedis() first.');
    }
    return redisClient;
}
/**
 * Check if Redis is connected
 */
export function isRedisConnected() {
    return redisClient?.status === 'ready';
}
/**
 * Get Redis client (alias for compatibility)
 */
export function getRedisClient() {
    return getRedis();
}
/**
 * Gracefully close Redis connection
 */
export async function closeRedis() {
    if (redisClient) {
        await redisClient.quit();
        redisClient = null;
        console.log('[Redis] Disconnected');
    }
}
// ============ Cache Helpers ============
export const CACHE_TTL = {
    SERVICE_LIST: 60,
    SERVICE_DETAIL: 300,
    REPUTATION_SCORE: 60,
    BLOCK_NUMBER: 5,
    PAYMENT_PROOF: 300,
};
export const CACHE_KEYS = {
    serviceList: (query) => `services:list:${query}`,
    serviceDetail: (id) => `services:detail:${id}`,
    reputation: (id) => `reputation:${id}`,
    paymentProof: (txHash) => `payment:proof:${txHash}`,
    blockNumber: () => 'chain:block:latest',
};
export async function setCache(key, value, ttlSeconds) {
    const redis = getRedis();
    await redis.set(key, JSON.stringify(value), 'EX', ttlSeconds);
}
export async function getCache(key) {
    const redis = getRedis();
    const value = await redis.get(key);
    if (!value)
        return null;
    return JSON.parse(value);
}
export async function deleteCache(key) {
    const redis = getRedis();
    await redis.del(key);
}
export async function isPaymentProofUsed(txHash) {
    const key = CACHE_KEYS.paymentProof(txHash);
    const exists = await getRedis().exists(key);
    return exists === 1;
}
export async function markPaymentProofUsed(txHash) {
    const key = CACHE_KEYS.paymentProof(txHash);
    await setCache(key, { usedAt: Date.now() }, CACHE_TTL.PAYMENT_PROOF);
}
//# sourceMappingURL=redis.js.map