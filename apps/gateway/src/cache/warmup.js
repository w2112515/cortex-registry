/**
 * Cache Warmup Module
 *
 * @description Pre-populate cache on startup to achieve <3s cold start
 * @see Task-23: Create warmup module
 * @see Vol.6 §3.3: Cache Warmup Strategy
 */
import { getRedisClient, isRedisConnected } from '../redis.js';
import { CACHE_CONFIG, batchSetServices, cacheReputation } from './strategy.js';
/** Default warmup configuration */
const DEFAULT_CONFIG = {
    mode: 'full',
    maxServices: 100,
    timeout: 10000, // 10 seconds max
    batchSize: 20,
};
// ============ Warmup State ============
let warmupState = {
    completed: false,
    result: null,
    startTime: null,
};
// ============ Core Functions ============
/**
 * Execute cache warmup on startup
 *
 * @param config - Warmup configuration
 * @returns WarmupResult with metrics
 */
export async function executeWarmup(config = {}) {
    const cfg = { ...DEFAULT_CONFIG, ...config };
    const startTime = Date.now();
    warmupState.startTime = startTime;
    const errors = [];
    let cachedServices = 0;
    let cachedReputations = 0;
    // Skip mode - immediate return
    if (cfg.mode === 'skip') {
        const result = {
            mode: 'skip',
            success: true,
            cached: { services: 0, reputations: 0 },
            duration: Date.now() - startTime,
            errors: [],
            timestamp: new Date().toISOString(),
        };
        warmupState.completed = true;
        warmupState.result = result;
        return result;
    }
    // Check Redis connection
    if (!isRedisConnected()) {
        errors.push('Redis not connected - warmup skipped');
        const result = {
            mode: cfg.mode,
            success: false,
            cached: { services: 0, reputations: 0 },
            duration: Date.now() - startTime,
            errors,
            timestamp: new Date().toISOString(),
        };
        warmupState.result = result;
        return result;
    }
    try {
        // Lazy mode - just validate cache keys exist
        if (cfg.mode === 'lazy') {
            const redis = getRedisClient();
            const exists = await redis.exists(CACHE_CONFIG.serviceList.key);
            const result = {
                mode: 'lazy',
                success: true,
                cached: {
                    services: exists ? 1 : 0,
                    reputations: 0
                },
                duration: Date.now() - startTime,
                errors: [],
                timestamp: new Date().toISOString(),
            };
            warmupState.completed = true;
            warmupState.result = result;
            return result;
        }
        // Full mode - preload from chain (with timeout)
        const warmupPromise = performFullWarmup(cfg);
        const timeoutPromise = new Promise((_, reject) => setTimeout(() => reject(new Error('Warmup timeout')), cfg.timeout));
        const warmupData = await Promise.race([warmupPromise, timeoutPromise]);
        // Cache services
        if (warmupData.services.length > 0) {
            await batchSetServices(warmupData.services);
            cachedServices = warmupData.services.length;
        }
        // Cache reputations
        for (const [serviceId, reputation] of warmupData.reputations) {
            try {
                await cacheReputation(serviceId, reputation);
                cachedReputations++;
            }
            catch (err) {
                errors.push(`Failed to cache reputation for ${serviceId}: ${err}`);
            }
        }
    }
    catch (err) {
        const errorMessage = err instanceof Error ? err.message : String(err);
        errors.push(`Warmup error: ${errorMessage}`);
    }
    const result = {
        mode: cfg.mode,
        success: errors.length === 0,
        cached: {
            services: cachedServices,
            reputations: cachedReputations
        },
        duration: Date.now() - startTime,
        errors,
        timestamp: new Date().toISOString(),
    };
    warmupState.completed = true;
    warmupState.result = result;
    return result;
}
/**
 * Perform full warmup - loads services from existing cache or initializes empty
 *
 * Note: In production, this would fetch from chain via indexer.
 * For now, it validates cache state and prepares for indexer data.
 */
async function performFullWarmup(config) {
    const redis = getRedisClient();
    const services = [];
    const reputations = new Map();
    // Check if we have existing cached data
    const cachedList = await redis.get(CACHE_CONFIG.serviceList.key);
    if (cachedList) {
        // Parse existing cache to validate structure
        try {
            const parsed = JSON.parse(cachedList);
            if (Array.isArray(parsed)) {
                // Existing cache is valid - indexer will populate real data
                console.log(`[Warmup] Found ${parsed.length} cached services`);
            }
        }
        catch {
            console.log('[Warmup] Invalid cache structure, will be refreshed by indexer');
        }
    }
    else {
        // No cache exists - set empty state for indexer to populate
        console.log('[Warmup] No cache found, initializing empty state');
        await redis.setex(CACHE_CONFIG.serviceList.key, CACHE_CONFIG.serviceList.ttl, JSON.stringify([]));
    }
    // Return empty arrays - indexer will populate real data
    // This ensures startup completes quickly without blocking on chain reads
    return { services, reputations };
}
// ============ Status Functions ============
/**
 * Get warmup completion status
 */
export function isWarmupComplete() {
    return warmupState.completed;
}
/**
 * Get warmup result (returns null if not completed)
 */
export function getWarmupResult() {
    return warmupState.result;
}
/**
 * Get warmup metrics for health check
 */
export function getWarmupMetrics() {
    if (!warmupState.result) {
        return {
            completed: false,
            duration: warmupState.startTime ? Date.now() - warmupState.startTime : null,
            success: null,
            cached: null,
        };
    }
    return {
        completed: warmupState.completed,
        duration: warmupState.result.duration,
        success: warmupState.result.success,
        cached: warmupState.result.cached,
    };
}
/**
 * Reset warmup state (for testing purposes)
 */
export function resetWarmupState() {
    warmupState = {
        completed: false,
        result: null,
        startTime: null,
    };
}
//# sourceMappingURL=warmup.js.map