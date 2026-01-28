/**
 * Discover Endpoint
 * 
 * @description Service discovery API with ranking algorithm
 * @see Task-20: Discover Endpoint
 * @see Vol.4 §2.1: Service Discovery API
 */

import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { getRedis, CACHE_TTL, CACHE_KEYS } from '../redis.js';
import {
    getCachedServiceList,
    cacheServiceList,
    generateQueryHash,
    deserializeService,
    batchGetReputation,
    type CachedServiceData,
    type CachedReputationData,
} from '../cache/strategy.js';
import { executeWithFailover, readContract } from '../rpc/failover.js';
import type { Address } from 'viem';

// ============ Types ============

/**
 * Discover query parameters
 */
interface DiscoverQuery {
    /** Filter by capability */
    capability?: 'tools' | 'resources' | 'prompts' | 'sampling' | undefined;
    /** Filter by tag */
    tag?: string | undefined;
    /** Minimum Bayesian score (0-100) */
    minScore?: number | undefined;
    /** Minimum stake in CRO */
    minStake?: number | undefined;
    /** Maximum results */
    limit?: number;
    /** Pagination offset */
    offset?: number;
    /** Sort field */
    sortBy?: 'score' | 'stake' | 'registeredAt';
    /** Sort direction */
    sortOrder?: 'asc' | 'desc';
}

/**
 * Discover response
 */
interface DiscoverResponse {
    services: DiscoverServiceItem[];
    total: number;
    page: number;
    perPage: number;
    queryTimeMs: number;
}

/**
 * Service item in discover response
 */
interface DiscoverServiceItem {
    id: string;
    provider: string;
    stake: string;
    state: number;
    metadataUri: string;
    registeredAt: number;
    reputation: {
        totalCalls: number;
        successCount: number;
        bayesianScore: number; // 0-100 display score
        rank: number;
    } | null;
    metadata: Record<string, unknown> | null;
}

// ============ Constants ============

const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 100;
const REGISTRY_ADDRESS: Address = process.env.REGISTRY_ADDRESS as Address || '0x0000000000000000000000000000000000000000';

// ============ Ranking Algorithm ============

/**
 * Calculate composite rank score for sorting
 * Combines Bayesian score + stake weight
 * 
 * Formula: RankScore = (BayesianScore * 0.7) + (StakeWeight * 0.3)
 * where StakeWeight = min(stake / MAX_STAKE_WEIGHT, 1.0)
 */
function calculateRankScore(
    bayesianScore: number,
    stake: bigint
): number {
    const MAX_STAKE_WEIGHT = BigInt(10000) * BigInt(10 ** 18); // 10,000 CRO

    const scoreComponent = bayesianScore * 0.7;
    const stakeWeight = Number(stake * BigInt(100) / MAX_STAKE_WEIGHT) / 100;
    const stakeComponent = Math.min(stakeWeight, 1.0) * 100 * 0.3;

    return scoreComponent + stakeComponent;
}

/**
 * Apply ranking to services
 */
function rankServices(
    services: CachedServiceData[]
): CachedServiceData[] {
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
async function fetchActiveServices(queryHash: string): Promise<CachedServiceData[]> {
    // MOCK_MODE: Return hardcoded demo services for visualization
    if (process.env.MOCK_MODE === 'true') {
        console.log('[Discover] MOCK_MODE enabled - returning demo services');
        return getMockServices();
    }

    // Try cache first with specific query hash
    const cached = await getCachedServiceList(queryHash);
    if (cached && cached.length > 0) {
        console.log(`[Discover] Cache hit for query: ${queryHash}`);
        return cached;
    }

    // Fallback to default list cache (populated by Indexer)
    if (queryHash !== 'default') {
        const defaultCached = await getCachedServiceList('default');
        if (defaultCached && defaultCached.length > 0) {
            console.log(`[Discover] Using default cache for query: ${queryHash}`);
            return defaultCached;
        }
    }

    // Cache miss - return empty array
    console.log(`[Discover] Cache miss for query: ${queryHash} - returning empty (Indexer has not synced yet)`);
    return [];
}

/**
 * Get mock services for MOCK_MODE demonstration
 */
function getMockServices(): CachedServiceData[] {
    const now = Math.floor(Date.now() / 1000);
    const lastUpdated = now;
    return [
        {
            id: '0x3c782f21e0c91eb5c7a9fb7d4b6fb2d53e713b67e3',
            provider: '0xb42a5fE98251f078F1A1D0Fca905765f71810876',
            stake: '1000000000000000000',
            state: 1,
            metadataUri: 'data:application/json',
            registeredAt: now - 3600,
            challengeDeadline: 0,
            challenger: null,
            rank: 1,
            reputation: { totalCalls: 250, successCount: 240, displayScore: 78, bayesianScore: '78000000000000000000', lastUpdated },
            metadata: { name: '[TESTNET] Cortex Knowledge Base', description: 'AI-powered knowledge graph. DEMO ONLY.', version: '1.0.0' }
        },
        {
            id: '0xb7a3325fd9d5da1dbb62b752763c06643adfc6a5d06b',
            provider: '0xb42a5fE98251f078F1A1D0Fca905765f71810876',
            stake: '2000000000000000000',
            state: 1,
            metadataUri: 'data:application/json',
            registeredAt: now - 7200,
            challengeDeadline: 0,
            challenger: null,
            rank: 2,
            reputation: { totalCalls: 180, successCount: 175, displayScore: 85, bayesianScore: '85000000000000000000', lastUpdated },
            metadata: { name: '[TESTNET] Vision Analyzer', description: 'Multi-modal image analysis. DEMO ONLY.', version: '1.0.0' }
        },
        {
            id: '0xcc49399a50274e7dcc49399a50274e7d0000000000',
            provider: '0xb42a5fE98251f078F1A1D0Fca905765f71810876',
            stake: '5000000000000000000',
            state: 1,
            metadataUri: 'data:application/json',
            registeredAt: now - 10800,
            challengeDeadline: 0,
            challenger: null,
            rank: 3,
            reputation: { totalCalls: 500, successCount: 495, displayScore: 92, bayesianScore: '92000000000000000000', lastUpdated },
            metadata: { name: '[TESTNET] Code Synthesizer', description: 'Advanced code generation. DEMO ONLY.', version: '1.0.0' }
        },
        {
            id: '0x799e63e870e55767799e63e870e557670000000000',
            provider: '0xb42a5fE98251f078F1A1D0Fca905765f71810876',
            stake: '3000000000000000000',
            state: 1,
            metadataUri: 'data:application/json',
            registeredAt: now - 14400,
            challengeDeadline: 0,
            challenger: null,
            rank: 4,
            reputation: { totalCalls: 320, successCount: 310, displayScore: 75, bayesianScore: '75000000000000000000', lastUpdated },
            metadata: { name: '[TESTNET] Data Transformer', description: 'Schema transformation. DEMO ONLY.', version: '1.0.0' }
        },
        {
            id: '0x186417ef94c932fa186417ef94c932fa0000000000',
            provider: '0xb42a5fE98251f078F1A1D0Fca905765f71810876',
            stake: '10000000000000000000',
            state: 3,
            metadataUri: 'data:application/json',
            registeredAt: now - 18000,
            challengeDeadline: 0,
            challenger: null,
            rank: 5,
            reputation: { totalCalls: 50, successCount: 30, displayScore: 35, bayesianScore: '35000000000000000000', lastUpdated },
            metadata: { name: '[TESTNET] Security Sentinel', description: 'Smart contract auditing. DEMO ONLY. SLASHED.', version: '1.0.0' }
        },
    ];
}

// ============ Filtering ============

/**
 * Apply query filters to services
 */
function applyFilters(
    services: CachedServiceData[],
    query: DiscoverQuery
): CachedServiceData[] {
    let filtered = [...services];

    // Filter by minimum score
    if (query.minScore !== undefined) {
        filtered = filtered.filter(s =>
            (s.reputation?.displayScore || 0) >= query.minScore!
        );
    }

    // Filter by minimum stake
    if (query.minStake !== undefined) {
        const minStakeWei = BigInt(query.minStake) * BigInt(10 ** 18);
        filtered = filtered.filter(s =>
            BigInt(s.stake) >= minStakeWei
        );
    }

    // Filter by capability (from metadata)
    if (query.capability) {
        filtered = filtered.filter(s => {
            const caps = (s.metadata as any)?.capabilities;
            if (!caps) return true; // Include if no capability info
            return caps.includes(query.capability);
        });
    }

    // Filter by tag
    if (query.tag) {
        filtered = filtered.filter(s => {
            const tags = (s.metadata as any)?.tags;
            if (!tags) return false;
            return tags.includes(query.tag);
        });
    }

    // Filter out inactive services - Temporarily disabled for demonstration
    // filtered = filtered.filter(s => s.state === 1);

    return filtered;
}

/**
 * Apply sorting to services
 */
function applySorting(
    services: CachedServiceData[],
    sortBy: string = 'score',
    sortOrder: string = 'desc'
): CachedServiceData[] {
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
export default async function discoverRoutes(fastify: FastifyInstance): Promise<void> {
    /**
     * GET /v1/discover
     * 
     * Discover services with filtering, sorting, and pagination
     */
    fastify.get<{
        Querystring: DiscoverQuery;
    }>('/v1/discover', async (request, reply) => {
        const startTime = Date.now();

        const {
            capability,
            tag,
            minScore,
            minStake,
            limit = DEFAULT_LIMIT,
            offset = 0,
            sortBy = 'score',
            sortOrder = 'desc',
        } = request.query;

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
            const responseServices: DiscoverServiceItem[] = paginatedServices.map((s, index) => ({
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

            const response: DiscoverResponse = {
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
        } catch (error) {
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
    fastify.get<{
        Params: { id: string };
    }>('/v1/service/:id', async (request, reply) => {
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
                const service = JSON.parse(cached) as CachedServiceData;
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
        } catch (error) {
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
function formatServiceDetail(service: CachedServiceData): DiscoverServiceItem {
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
