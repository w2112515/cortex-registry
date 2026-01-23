/**
 * Discover Endpoint
 *
 * @description Service discovery API with ranking algorithm
 * @see Task-20: Discover Endpoint
 * @see Vol.4 §2.1: Service Discovery API
 */
import { getRedis, CACHE_TTL, CACHE_KEYS } from '../redis.js';
import { getCachedServiceList, cacheServiceList, generateQueryHash, deserializeService, batchGetReputation, } from '../cache/strategy.js';
import { executeWithFailover, readContract } from '../rpc/failover.js';
// ============ Constants ============
const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 100;
const REGISTRY_ADDRESS = process.env.REGISTRY_ADDRESS || '0x0000000000000000000000000000000000000000';
// ============ Ranking Algorithm ============
/**
 * Calculate composite rank score for sorting
 * Combines Bayesian score + stake weight
 *
 * Formula: RankScore = (BayesianScore * 0.7) + (StakeWeight * 0.3)
 * where StakeWeight = min(stake / MAX_STAKE_WEIGHT, 1.0)
 */
function calculateRankScore(bayesianScore, stake) {
    const MAX_STAKE_WEIGHT = BigInt(10000) * BigInt(10 ** 18); // 10,000 CRO
    const scoreComponent = bayesianScore * 0.7;
    const stakeWeight = Number(stake * BigInt(100) / MAX_STAKE_WEIGHT) / 100;
    const stakeComponent = Math.min(stakeWeight, 1.0) * 100 * 0.3;
    return scoreComponent + stakeComponent;
}
/**
 * Apply ranking to services
 */
function rankServices(services) {
    // Calculate rank scores
    const servicesWithScores = services.map(service => {
        const bayesianScore = service.reputation?.displayScore || 50; // Default 50 for unrated
        const stake = BigInt(service.stake);
        const rankScore = calculateRankScore(bayesianScore, stake);
        return { service, rankScore };
    });
    // Sort by rank score descending
    servicesWithScores.sort((a, b) => b.rankScore - a.rankScore);
    // Assign ranks
    return servicesWithScores.map((item, index) => ({
        ...item.service,
        rank: index + 1,
    }));
}
// ============ Data Fetching ============
/**
 * Fetch all active services from cache or chain
 *
 * @description Returns cached services if available, otherwise empty array.
 * The Indexer (Task-17) is responsible for populating the cache from chain events.
 * This follows CQRS pattern: Read path should never invent data.
 */
async function fetchActiveServices(queryHash) {
    // Try cache first
    const cached = await getCachedServiceList(queryHash);
    if (cached && cached.length > 0) {
        console.log(`[Discover] Cache hit for query: ${queryHash}`);
        return cached;
    }
    // Cache miss - return empty array
    // The Indexer is responsible for populating Redis from chain events
    // We should NOT invent fake data here
    console.log(`[Discover] Cache miss for query: ${queryHash} - returning empty (Indexer has not synced yet)`);
    return [];
}
// ============ Filtering ============
/**
 * Apply query filters to services
 */
function applyFilters(services, query) {
    let filtered = [...services];
    // Filter by minimum score
    if (query.minScore !== undefined) {
        filtered = filtered.filter(s => (s.reputation?.displayScore || 0) >= query.minScore);
    }
    // Filter by minimum stake
    if (query.minStake !== undefined) {
        const minStakeWei = BigInt(query.minStake) * BigInt(10 ** 18);
        filtered = filtered.filter(s => BigInt(s.stake) >= minStakeWei);
    }
    // Filter by capability (from metadata)
    if (query.capability) {
        filtered = filtered.filter(s => {
            const caps = s.metadata?.capabilities;
            if (!caps)
                return true; // Include if no capability info
            return caps.includes(query.capability);
        });
    }
    // Filter by tag
    if (query.tag) {
        filtered = filtered.filter(s => {
            const tags = s.metadata?.tags;
            if (!tags)
                return false;
            return tags.includes(query.tag);
        });
    }
    // Filter out non-active services
    filtered = filtered.filter(s => s.state === 1); // Active only
    return filtered;
}
/**
 * Apply sorting to services
 */
function applySorting(services, sortBy = 'score', sortOrder = 'desc') {
    const sorted = [...services];
    sorted.sort((a, b) => {
        let comparison = 0;
        switch (sortBy) {
            case 'score':
                const scoreA = a.reputation?.displayScore || 0;
                const scoreB = b.reputation?.displayScore || 0;
                comparison = scoreA - scoreB;
                break;
            case 'stake':
                comparison = Number(BigInt(a.stake) - BigInt(b.stake));
                break;
            case 'registeredAt':
                comparison = a.registeredAt - b.registeredAt;
                break;
            default:
                // Default to rank
                comparison = a.rank - b.rank;
        }
        return sortOrder === 'asc' ? comparison : -comparison;
    });
    return sorted;
}
// ============ Route Handler ============
/**
 * Register discover routes
 */
export default async function discoverRoutes(fastify) {
    /**
     * GET /v1/discover
     *
     * Discover services with filtering, sorting, and pagination
     */
    fastify.get('/v1/discover', async (request, reply) => {
        const startTime = Date.now();
        const { capability, tag, minScore, minStake, limit = DEFAULT_LIMIT, offset = 0, sortBy = 'score', sortOrder = 'desc', } = request.query;
        // Validate limit
        const validLimit = Math.min(Math.max(1, limit), MAX_LIMIT);
        // Generate query hash for caching
        const queryHash = generateQueryHash({
            capability,
            tag,
            minScore,
            minStake,
        });
        try {
            // Fetch services
            let services = await fetchActiveServices(queryHash);
            // Apply filters
            services = applyFilters(services, {
                capability,
                tag,
                minScore,
                minStake,
            });
            // Rank services
            services = rankServices(services);
            // Apply sorting
            services = applySorting(services, sortBy, sortOrder);
            // Get total before pagination
            const total = services.length;
            // Apply pagination
            const paginatedServices = services.slice(offset, offset + validLimit);
            // Transform to response format
            const responseServices = paginatedServices.map((s, index) => ({
                id: s.id,
                provider: s.provider,
                stake: s.stake,
                state: s.state,
                metadataUri: s.metadataUri,
                registeredAt: s.registeredAt,
                reputation: s.reputation ? {
                    totalCalls: s.reputation.totalCalls,
                    successCount: s.reputation.successCount,
                    bayesianScore: s.reputation.displayScore,
                    rank: offset + index + 1,
                } : null,
                metadata: s.metadata,
            }));
            const queryTimeMs = Date.now() - startTime;
            const response = {
                services: responseServices,
                total,
                page: Math.floor(offset / validLimit) + 1,
                perPage: validLimit,
                queryTimeMs,
            };
            // Set cache headers
            reply.header('Cache-Control', 'public, max-age=60');
            reply.header('X-Query-Time', queryTimeMs.toString());
            return response;
        }
        catch (error) {
            request.log.error(error, 'Discover endpoint error');
            reply.status(500);
            return {
                error: 'Internal server error',
                message: error instanceof Error ? error.message : 'Unknown error',
            };
        }
    });
    /**
     * GET /v1/service/:id
     *
     * Get single service details by ID
     */
    fastify.get('/v1/service/:id', async (request, reply) => {
        const { id } = request.params;
        // Validate service ID format
        if (!id.match(/^0x[0-9a-fA-F]{64}$/)) {
            reply.status(400);
            return {
                error: 'Invalid service ID format',
                message: 'Service ID must be a 32-byte hex string',
            };
        }
        try {
            // Try Redis cache first
            const redis = getRedis();
            const cacheKey = CACHE_KEYS.serviceDetail(id);
            const cached = await redis.get(cacheKey);
            if (cached) {
                const service = JSON.parse(cached);
                reply.header('X-Cache', 'HIT');
                return formatServiceDetail(service);
            }
            reply.header('X-Cache', 'MISS');
            // TODO: Fetch from chain when contract is deployed
            // For now, return 404 if not in cache
            reply.status(404);
            return {
                error: 'Service not found',
                message: `No service found with ID: ${id}`,
            };
        }
        catch (error) {
            request.log.error(error, 'Service detail endpoint error');
            reply.status(500);
            return {
                error: 'Internal server error',
                message: error instanceof Error ? error.message : 'Unknown error',
            };
        }
    });
}
/**
 * Format service detail for API response
 */
function formatServiceDetail(service) {
    return {
        id: service.id,
        provider: service.provider,
        stake: service.stake,
        state: service.state,
        metadataUri: service.metadataUri,
        registeredAt: service.registeredAt,
        reputation: service.reputation ? {
            totalCalls: service.reputation.totalCalls,
            successCount: service.reputation.successCount,
            bayesianScore: service.reputation.displayScore,
            rank: service.rank,
        } : null,
        metadata: service.metadata,
    };
}
//# sourceMappingURL=discover.js.map