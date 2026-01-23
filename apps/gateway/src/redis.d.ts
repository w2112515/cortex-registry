/**
 * Redis Connection Module
 *
 * @description Redis client setup for Gateway caching layer
 * @see Task-12: Setup Fastify Redis
 */
declare const IORedis: typeof import("ioredis").default;
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
 * Initialize Redis connection
 */
export declare function initRedis(config?: Partial<RedisConfig>): Promise<RedisInstance>;
/**
 * Get existing Redis client
 */
export declare function getRedis(): RedisInstance;
/**
 * Check if Redis is connected
 */
export declare function isRedisConnected(): boolean;
/**
 * Get Redis client (alias for compatibility)
 */
export declare function getRedisClient(): RedisInstance;
/**
 * Gracefully close Redis connection
 */
export declare function closeRedis(): Promise<void>;
export declare const CACHE_TTL: {
    readonly SERVICE_LIST: 60;
    readonly SERVICE_DETAIL: 300;
    readonly REPUTATION_SCORE: 60;
    readonly BLOCK_NUMBER: 5;
    readonly PAYMENT_PROOF: 300;
};
export declare const CACHE_KEYS: {
    readonly serviceList: (query: string) => string;
    readonly serviceDetail: (id: string) => string;
    readonly reputation: (id: string) => string;
    readonly paymentProof: (txHash: string) => string;
    readonly blockNumber: () => string;
};
export declare function setCache(key: string, value: unknown, ttlSeconds: number): Promise<void>;
export declare function getCache<T>(key: string): Promise<T | null>;
export declare function deleteCache(key: string): Promise<void>;
export declare function isPaymentProofUsed(txHash: string): Promise<boolean>;
export declare function markPaymentProofUsed(txHash: string): Promise<void>;
export {};
//# sourceMappingURL=redis.d.ts.map