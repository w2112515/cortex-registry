/**
 * Cache Strategy Module
 *
 * @description Unified caching strategy with TTL policies and data structure optimization
 * @see Task-18: Redis Cache Strategy
 * @see Vol.6 §2.2: Redis 缓存策略
 */
import type { EnrichedService, ServiceId, ServiceState, ReputationData } from '../types.js';
/**
 * Cache invalidation event types (from Vol.6 §2.2)
 */
export type InvalidationEvent = 'ServiceRegistered' | 'ServiceActivated' | 'ServiceChallenged' | 'ServiceSlashed' | 'CallRecorded' | 'ChallengeResolved' | 'ReputationUpdated';
/**
 * Cache configuration per data type
 */
export interface CacheConfig {
    key: string | ((id: string) => string);
    ttl: number;
    invalidateOn: InvalidationEvent[];
}
/**
 * Centralized cache configuration (from Vol.6 §2.2)
 */
export declare const CACHE_CONFIG: Record<string, CacheConfig>;
/**
 * Service data for Redis storage (JSON-serializable)
 */
export interface CachedServiceData {
    id: ServiceId;
    provider: string;
    stake: string;
    state: ServiceState;
    metadataUri: string;
    registeredAt: number;
    challengeDeadline: number;
    challenger: string | null;
    metadata: Record<string, unknown> | null;
    reputation: CachedReputationData | null;
    rank: number;
}
/**
 * Reputation data for Redis storage
 */
export interface CachedReputationData {
    totalCalls: number;
    successCount: number;
    bayesianScore: string;
    displayScore: number;
    lastUpdated: number;
}
/**
 * Cache a list of services
 */
export declare function cacheServiceList(services: EnrichedService[], queryHash?: string): Promise<void>;
/**
 * Get cached service list
 */
export declare function getCachedServiceList(queryHash?: string): Promise<CachedServiceData[] | null>;
/**
 * Cache a single service
 */
export declare function cacheService(service: EnrichedService): Promise<void>;
/**
 * Get cached service
 */
export declare function getCachedService(serviceId: ServiceId): Promise<CachedServiceData | null>;
/**
 * Cache reputation score
 */
export declare function cacheReputation(serviceId: ServiceId, reputation: ReputationData): Promise<void>;
/**
 * Get cached reputation
 */
export declare function getCachedReputation(serviceId: ServiceId): Promise<CachedReputationData | null>;
/**
 * Pipeline batch get reputation scores
 */
export declare function batchGetReputation(serviceIds: ServiceId[]): Promise<Map<ServiceId, CachedReputationData>>;
/**
 * Pipeline batch set services
 */
export declare function batchSetServices(services: EnrichedService[]): Promise<void>;
/**
 * Invalidate cache based on event type
 */
export declare function invalidateByEvent(event: InvalidationEvent, serviceId?: ServiceId): Promise<number>;
/**
 * Clear all cache (for debugging/maintenance)
 */
export declare function clearAllCache(): Promise<number>;
/**
 * Deserialize cached service data
 */
export declare function deserializeService(cached: CachedServiceData): EnrichedService;
/**
 * Deserialize cached reputation data
 */
export declare function deserializeReputation(cached: CachedReputationData): ReputationData;
/**
 * Generate hash for discover query (for cache key)
 */
export declare function generateQueryHash(params: Record<string, unknown>): string;
//# sourceMappingURL=strategy.d.ts.map