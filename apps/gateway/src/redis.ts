/**
 * Redis Connection Module
 * 
 * @description Redis client setup for Gateway caching layer
 * @see Task-12: Setup Fastify Redis
 */

import IORedisModule from 'ioredis';

// ESM compatibility: ioredis exports the class as default
const IORedis = IORedisModule as unknown as typeof import('ioredis').default;

// Type alias for Redis instance
type RedisInstance = InstanceType<typeof IORedis>;

/**
 * Redis client configuration
 */
export interface RedisConfig {
    host: string;
    port: number;
    password?: string | undefined;
    db?: number | undefined;
    connectTimeout?: number | undefined;
    maxRetriesPerRequest?: number | undefined;
    keyPrefix?: string | undefined;
}

/**
 * Default configuration from environment
 */
const defaultConfig: RedisConfig = {
    host: process.env.REDIS_HOST || 'localhost',
    port: parseInt(process.env.REDIS_PORT || '6379'),
    password: process.env.REDIS_PASSWORD || undefined,
    db: parseInt(process.env.REDIS_DB || '0'),
    connectTimeout: 10000,
    maxRetriesPerRequest: 3,
    keyPrefix: 'cortex:',
};

// Singleton Redis client
let redisClient: RedisInstance | null = null;

/**
 * Initialize Redis connection
 */
export async function initRedis(config: Partial<RedisConfig> = {}): Promise<RedisInstance> {
    const mergedConfig = { ...defaultConfig, ...config };

    if (redisClient) {
        return redisClient;
    }

    // Build options, only include defined values
    const options: Record<string, unknown> = {
        host: mergedConfig.host,
        port: mergedConfig.port,
        lazyConnect: true,
        retryStrategy: (times: number) => {
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
    if (mergedConfig.password) options.password = mergedConfig.password;
    if (mergedConfig.db !== undefined) options.db = mergedConfig.db;
    if (mergedConfig.connectTimeout !== undefined) options.connectTimeout = mergedConfig.connectTimeout;
    if (mergedConfig.maxRetriesPerRequest !== undefined) options.maxRetriesPerRequest = mergedConfig.maxRetriesPerRequest;
    if (mergedConfig.keyPrefix) options.keyPrefix = mergedConfig.keyPrefix;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const client = new IORedis(options as any);

    client.on('connect', () => {
        console.log('[Redis] Connected successfully');
    });

    client.on('error', (err: Error) => {
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
export function getRedis(): RedisInstance {
    if (!redisClient) {
        throw new Error('[Redis] Client not initialized. Call initRedis() first.');
    }
    return redisClient;
}

/**
 * Check if Redis is connected
 */
export function isRedisConnected(): boolean {
    return redisClient?.status === 'ready';
}

/**
 * Get Redis client (alias for compatibility)
 */
export function getRedisClient(): RedisInstance {
    return getRedis();
}

/**
 * Gracefully close Redis connection
 */
export async function closeRedis(): Promise<void> {
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
} as const;

export const CACHE_KEYS = {
    serviceList: (query: string) => `services:list:${query}`,
    serviceDetail: (id: string) => `services:detail:${id}`,
    reputation: (id: string) => `reputation:${id}`,
    paymentProof: (txHash: string) => `payment:proof:${txHash}`,
    blockNumber: () => 'chain:block:latest',
} as const;

export async function setCache(key: string, value: unknown, ttlSeconds: number): Promise<void> {
    const redis = getRedis();
    await redis.set(key, JSON.stringify(value), 'EX', ttlSeconds);
}

export async function getCache<T>(key: string): Promise<T | null> {
    const redis = getRedis();
    const value = await redis.get(key);
    if (!value) return null;
    return JSON.parse(value) as T;
}

export async function deleteCache(key: string): Promise<void> {
    const redis = getRedis();
    await redis.del(key);
}

export async function isPaymentProofUsed(txHash: string): Promise<boolean> {
    const key = CACHE_KEYS.paymentProof(txHash);
    const exists = await getRedis().exists(key);
    return exists === 1;
}

export async function markPaymentProofUsed(txHash: string): Promise<void> {
    const key = CACHE_KEYS.paymentProof(txHash);
    await setCache(key, { usedAt: Date.now() }, CACHE_TTL.PAYMENT_PROOF);
}
