/**
 * Cache Strategy Module
 *
 * @description Unified caching strategy with TTL policies and data structure optimization
 * @see Task-18: Redis Cache Strategy
 * @see Vol.6 §2.2: Redis 缓存策略
 */
import Redis from 'ioredis';
import { getRedis, setCache, getCache, deleteCache, CACHE_TTL, CACHE_KEYS } from '../redis.js';
/**
 * Centralized cache configuration (from Vol.6 §2.2)
 */
export const CACHE_CONFIG = {
    // 服务列表缓存
    serviceList: {
        key: 'cortex:services:all',
        ttl: 60, // 60 秒
        invalidateOn: ['ServiceRegistered', 'ServiceSlashed', 'ServiceActivated'],
    },
    // 单服务详情缓存
    serviceDetail: {
        key: (serviceId) => `cortex:service:${serviceId}`,
        ttl: 300, // 5 分钟
        invalidateOn: ['CallRecorded', 'ServiceChallenged', 'ChallengeResolved'],
    },
    // 信誉评分缓存 (高频更新)
    reputation: {
        key: (serviceId) => `cortex:reputation:${serviceId}`,
        ttl: 30, // 30 秒
        invalidateOn: ['CallRecorded', 'ReputationUpdated'],
    },
    // 发现查询结果缓存
    discoverQuery: {
        key: (queryHash) => `cortex:discover:${queryHash}`,
        ttl: 60, // 60 秒
        invalidateOn: ['ServiceRegistered', 'ServiceSlashed', 'ReputationUpdated'],
    },
};
// ============ Cache Operations ============
/**
 * Cache a list of services
 */
export async function cacheServiceList(services, queryHash = 'default') {
    const key = `cortex:services:list:${queryHash}`;
    const cacheData = services.map(serializeService);
    const config = CACHE_CONFIG.serviceList;
    await setCache(key, cacheData, config ? config.ttl : 60);
}
/**
 * Get cached service list
 */
export async function getCachedServiceList(queryHash = 'default') {
    const key = `cortex:services:list:${queryHash}`;
    return getCache(key);
}
/**
 * Cache a single service
 */
export async function cacheService(service) {
    const key = CACHE_KEYS.serviceDetail(service.id);
    const cacheData = serializeService(service);
    const config = CACHE_CONFIG.serviceDetail;
    await setCache(key, cacheData, config ? config.ttl : 300);
}
/**
 * Get cached service
 */
export async function getCachedService(serviceId) {
    const key = CACHE_KEYS.serviceDetail(serviceId);
    return getCache(key);
}
/**
 * Cache reputation score
 */
export async function cacheReputation(serviceId, reputation) {
    const key = CACHE_KEYS.reputation(serviceId);
    const cacheData = serializeReputation(reputation);
    const config = CACHE_CONFIG.reputation;
    await setCache(key, cacheData, config ? config.ttl : 30);
}
/**
 * Get cached reputation
 */
export async function getCachedReputation(serviceId) {
    const key = CACHE_KEYS.reputation(serviceId);
    return getCache(key);
}
// ============ Batch Operations (Vol.6 §3.2) ============
/**
 * Pipeline batch get reputation scores
 */
export async function batchGetReputation(serviceIds) {
    const redis = getRedis();
    const pipeline = redis.pipeline();
    for (const id of serviceIds) {
        pipeline.get(CACHE_KEYS.reputation(id));
    }
    const results = await pipeline.exec();
    const map = new Map();
    results?.forEach((result, index) => {
        if (result[0] === null && result[1]) {
            try {
                const data = JSON.parse(result[1]);
                const id = serviceIds[index];
                if (id)
                    map.set(id, data);
            }
            catch {
                // Skip invalid cache entries
            }
        }
    });
    return map;
}
/**
 * Pipeline batch set services
 */
export async function batchSetServices(services) {
    const redis = getRedis();
    const pipeline = redis.pipeline();
    const config = CACHE_CONFIG.serviceDetail;
    const ttl = config ? config.ttl : 300;
    for (const service of services) {
        const key = CACHE_KEYS.serviceDetail(service.id);
        const data = serializeService(service);
        pipeline.setex(key, ttl, JSON.stringify(data));
    }
    await pipeline.exec();
}
// ============ Invalidation ============
/**
 * Invalidate cache based on event type
 */
export async function invalidateByEvent(event, serviceId) {
    const redis = getRedis();
    let deletedCount = 0;
    for (const [name, config] of Object.entries(CACHE_CONFIG)) {
        if (config.invalidateOn.includes(event)) {
            if (typeof config.key === 'function' && serviceId) {
                // Service-specific key
                await redis.del(config.key(serviceId));
                deletedCount++;
            }
            else if (typeof config.key === 'string') {
                // Global key
                await redis.del(config.key);
                deletedCount++;
            }
            else if (name === 'serviceList' || name === 'discoverQuery') {
                // Pattern-based invalidation
                const pattern = name === 'serviceList'
                    ? 'cortex:services:list:*'
                    : 'cortex:discover:*';
                const keys = await redis.keys(pattern);
                if (keys.length > 0) {
                    await redis.del(...keys);
                    deletedCount += keys.length;
                }
            }
        }
    }
    return deletedCount;
}
/**
 * Clear all cache (for debugging/maintenance)
 */
export async function clearAllCache() {
    const redis = getRedis();
    const keys = await redis.keys('cortex:*');
    if (keys.length > 0) {
        await redis.del(...keys);
    }
    return keys.length;
}
// ============ Serialization ============
/**
 * Serialize EnrichedService for Redis storage
 */
function serializeService(service) {
    return {
        id: service.id,
        provider: service.onChain.provider,
        stake: service.onChain.stake.toString(),
        state: service.onChain.state,
        metadataUri: service.onChain.metadataUri,
        registeredAt: Number(service.onChain.registeredAt),
        challengeDeadline: Number(service.onChain.challengeDeadline),
        challenger: service.onChain.challenger || null,
        metadata: service.metadata,
        reputation: service.reputation ? serializeReputation(service.reputation) : null,
        rank: service.rank,
    };
}
/**
 * Serialize ReputationData for Redis storage
 */
function serializeReputation(reputation) {
    return {
        totalCalls: reputation.totalCalls,
        successCount: reputation.successCount,
        bayesianScore: reputation.bayesianScore.toString(),
        displayScore: reputation.displayScore,
        lastUpdated: reputation.lastUpdated,
    };
}
/**
 * Deserialize cached service data
 */
export function deserializeService(cached) {
    return {
        id: cached.id,
        onChain: {
            provider: cached.provider,
            stake: BigInt(cached.stake),
            state: cached.state,
            metadataUri: cached.metadataUri,
            registeredAt: BigInt(cached.registeredAt),
            challengeDeadline: BigInt(cached.challengeDeadline),
            challenger: cached.challenger || ('0x' + '0'.repeat(40)),
        },
        metadata: cached.metadata,
        reputation: cached.reputation ? deserializeReputation(cached.reputation) : null,
        rank: cached.rank,
    };
}
/**
 * Deserialize cached reputation data
 */
export function deserializeReputation(cached) {
    return {
        totalCalls: cached.totalCalls,
        successCount: cached.successCount,
        bayesianScore: BigInt(cached.bayesianScore),
        displayScore: cached.displayScore,
        lastUpdated: cached.lastUpdated,
    };
}
// ============ Query Hash ============
/**
 * Generate hash for discover query (for cache key)
 */
export function generateQueryHash(params) {
    const sorted = Object.keys(params)
        .sort()
        .map(k => `${k}=${JSON.stringify(params[k])}`)
        .join('&');
    // Simple hash for cache key (not cryptographic)
    let hash = 0;
    for (let i = 0; i < sorted.length; i++) {
        const char = sorted.charCodeAt(i);
        hash = ((hash << 5) - hash) + char;
        hash = hash & hash; // Convert to 32bit integer
    }
    return Math.abs(hash).toString(36);
}
//# sourceMappingURL=strategy.js.map