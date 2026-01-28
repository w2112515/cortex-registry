/**
 * Redis Indexer Module
 * 
 * @description Monitors on-chain events and synchronizes service data to Redis
 * @see Task-17: Redis Indexer
 * @see Vol.6 §2.1: Read Path (High Volume) - CQRS-Lite Pattern
 */

import { createPublicClient, http, parseAbiItem, type Log, type PublicClient, type Address, type Hex } from 'viem';
import { cronosTestnet } from 'viem/chains';
import { getRedis, setCache, deleteCache, CACHE_TTL, CACHE_KEYS } from './redis.js';
import type { ServiceState, ReputationData, ServiceId } from './types.js';
import type { CachedServiceData, CachedReputationData } from './cache/strategy.js';

// ============ Configuration ============

/**
 * Contract address (to be updated after deployment)
 */
const REGISTRY_ADDRESS: Address = process.env.REGISTRY_ADDRESS as Address || '0x0000000000000000000000000000000000000000';

/**
 * Starting block for event sync (0 = from latest)
 */
const START_BLOCK = BigInt(process.env.START_BLOCK || 0);

/**
 * Polling interval for event watching (ms)
 */
const POLL_INTERVAL = parseInt(process.env.POLL_INTERVAL || '5000');

// ============ Event ABIs ============

const EVENT_ABIS = {
    ServiceRegistered: parseAbiItem('event ServiceRegistered(bytes32 indexed serviceId, address indexed provider, uint256 stake)'),
    ServiceActivated: parseAbiItem('event ServiceActivated(bytes32 indexed serviceId)'),
    ServiceChallenged: parseAbiItem('event ServiceChallenged(bytes32 indexed serviceId, address indexed challenger)'),
    ServiceSlashed: parseAbiItem('event ServiceSlashed(bytes32 indexed serviceId, uint256 slashedAmount)'),
    ChallengeResolved: parseAbiItem('event ChallengeResolved(bytes32 indexed serviceId, bool isMalicious)'),
    ReputationUpdated: parseAbiItem('event ReputationUpdated(bytes32 indexed serviceId, uint256 newScore)'),
    ServiceWithdrawn: parseAbiItem('event ServiceWithdrawn(bytes32 indexed serviceId)'),
} as const;

// ============ Types ============

interface IndexerState {
    isRunning: boolean;
    lastProcessedBlock: bigint;
    processedEvents: number;
    unwatchFn: (() => void) | null;
}

interface ServiceCacheData {
    id: ServiceId;
    provider: Address;
    stake: string; // BigInt as string for JSON serialization
    state: ServiceState;
    registeredAt: number;
    challengeDeadline: number;
    challenger: Address | null;
    reputation: ReputationData | null;
}

// ============ State ============

const indexerState: IndexerState = {
    isRunning: false,
    lastProcessedBlock: BigInt(0),
    processedEvents: 0,
    unwatchFn: null,
};

let publicClient: PublicClient | null = null;

// ============ Initialization ============

/**
 * Get or create the public client for chain interactions
 */
function getPublicClient(): PublicClient {
    if (!publicClient) {
        publicClient = createPublicClient({
            chain: cronosTestnet,
            transport: http(process.env.RPC_URL || 'https://evm-t3.cronos.org'),
        });
    }
    return publicClient;
}

/**
 * Sync historical events from START_BLOCK to current block
 * @see Task-35: 实现 Indexer 启动时历史事件同步
 */
async function syncHistoricalEvents(): Promise<number> {
    if (process.env.MOCK_MODE === 'true') {
        console.log('⚠️ [Indexer] Skipping historical sync in MOCK_MODE');
        return 0;
    }
    const client = getPublicClient();
    const currentBlock = await client.getBlockNumber();

    // Determine the range to sync
    const fromBlock = START_BLOCK > BigInt(0) ? START_BLOCK : BigInt(0);
    const toBlock = currentBlock;

    if (fromBlock >= toBlock) {
        console.log('[Indexer] No historical blocks to sync');
        return 0;
    }

    console.log(`[Indexer] Syncing historical events from block ${fromBlock} to ${toBlock}...`);

    let totalEvents = 0;
    const BATCH_SIZE = BigInt(2000); // Cronos RPC limit: max 2000 blocks per getLogs
    const LOG_RETRY_LIMIT = 3;
    const LOG_RETRY_DELAY_MS = 1000;

    const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

    const fetchLogsWithRetry = async (
        params: Parameters<PublicClient['getLogs']>[0],
        label: string
    ): Promise<Log[]> => {
        let lastError: unknown;
        for (let attempt = 1; attempt <= LOG_RETRY_LIMIT; attempt++) {
            try {
                return await client.getLogs(params);
            } catch (error) {
                lastError = error;
                const message = error instanceof Error ? error.message : String(error);
                console.warn(`[Indexer] getLogs failed for ${label} (attempt ${attempt}/${LOG_RETRY_LIMIT}): ${message}`);
                if (attempt < LOG_RETRY_LIMIT) {
                    await delay(LOG_RETRY_DELAY_MS * attempt);
                }
            }
        }

        throw lastError instanceof Error ? lastError : new Error(String(lastError));
    };

    try {
        // Process in batches
        for (let batchStart = fromBlock; batchStart <= toBlock; batchStart += BATCH_SIZE) {
            const batchEnd = batchStart + BATCH_SIZE - BigInt(1) > toBlock
                ? toBlock
                : batchStart + BATCH_SIZE - BigInt(1);

            // Fetch logs for all event types
            const logs = await fetchLogsWithRetry(
                {
                    address: REGISTRY_ADDRESS,
                    events: Object.values(EVENT_ABIS),
                    fromBlock: batchStart,
                    toBlock: batchEnd,
                },
                `blocks ${batchStart}-${batchEnd}`
            );

            // Process each log
            for (const log of logs) {
                await processLog(log);
            }

            totalEvents += logs.length;

            if (logs.length > 0) {
                console.log(`[Indexer] Historical sync: processed ${logs.length} events (blocks ${batchStart}-${batchEnd})`);
            }
        }

        console.log(`[Indexer] Historical sync complete: ${totalEvents} total events`);

        // Rebuild service list cache after historical sync (Task-46)
        await rebuildServiceListCache();

        return totalEvents;
    } catch (error) {
        console.error('[Indexer] Error during historical sync:', error);
        throw error;
    }
}

/**
 * Start the indexer
 */
export async function startIndexer(): Promise<void> {
    if (process.env.MOCK_MODE === 'true') {
        console.log('⚠️ [Indexer] Mock Indexer started (No chain watcher)');
        indexerState.isRunning = true;
        return;
    }
    if (indexerState.isRunning) {
        console.log('[Indexer] Already running');
        return;
    }

    console.log('[Indexer] Starting event watcher...');

    const client = getPublicClient();

    // Step 1: Sync historical events first (Task-35 enhancement)
    try {
        const historicalCount = await syncHistoricalEvents();
        console.log(`[Indexer] Loaded ${historicalCount} historical events into cache`);
    } catch (error) {
        console.error('[Indexer] Historical sync failed, continuing with live events:', error);
    }

    // Step 2: Get current block number
    const currentBlock = await client.getBlockNumber();
    indexerState.lastProcessedBlock = currentBlock;

    // Step 3: Start watching for new events
    indexerState.unwatchFn = client.watchBlockNumber({
        onBlockNumber: async (blockNumber) => {
            await processNewBlock(blockNumber);
        },
        pollingInterval: POLL_INTERVAL,
    });

    // Step 4: Start periodic cache refresh (every 5 minutes)
    const CACHE_REFRESH_INTERVAL = 5 * 60 * 1000; // 5 minutes
    setInterval(async () => {
        console.log('[Indexer] Periodic cache refresh...');
        await rebuildServiceListCache();
    }, CACHE_REFRESH_INTERVAL);

    indexerState.isRunning = true;

    console.log(`[Indexer] Started, watching from block ${indexerState.lastProcessedBlock}`);
}

/**
 * Stop the indexer
 */
export function stopIndexer(): void {
    if (indexerState.unwatchFn) {
        indexerState.unwatchFn();
        indexerState.unwatchFn = null;
    }
    indexerState.isRunning = false;
    console.log('[Indexer] Stopped');
}

/**
 * Get indexer status
 */
export function getIndexerStatus() {
    return {
        isRunning: indexerState.isRunning,
        lastProcessedBlock: indexerState.lastProcessedBlock.toString(),
        processedEvents: indexerState.processedEvents,
    };
}

// ============ Event Processing ============

/**
 * Process events from a new block
 */
async function processNewBlock(blockNumber: bigint): Promise<void> {
    if (blockNumber <= indexerState.lastProcessedBlock) {
        return;
    }

    const client = getPublicClient();

    try {
        // Fetch logs for all event types
        const logs = await client.getLogs({
            address: REGISTRY_ADDRESS,
            events: Object.values(EVENT_ABIS),
            fromBlock: indexerState.lastProcessedBlock + BigInt(1),
            toBlock: blockNumber,
        });

        // Process each log
        for (const log of logs) {
            await processLog(log);
        }

        // Update block number in Redis cache
        await setCache(CACHE_KEYS.blockNumber(), blockNumber.toString(), CACHE_TTL.BLOCK_NUMBER);

        indexerState.lastProcessedBlock = blockNumber;

        if (logs.length > 0) {
            console.log(`[Indexer] Processed ${logs.length} events at block ${blockNumber}`);
        }
    } catch (error) {
        console.error(`[Indexer] Error processing block ${blockNumber}:`, error);
    }
}

/**
 * Process a single event log
 */
async function processLog(log: Log): Promise<void> {
    const eventName = getEventName(log);
    console.log(`[Indexer] Processing event: ${eventName || 'Unknown'} at block ${log.blockNumber}`);
    if (!eventName) return;

    indexerState.processedEvents++;

    switch (eventName) {
        case 'ServiceRegistered':
            await handleServiceRegistered(log);
            break;
        case 'ServiceActivated':
            await handleServiceActivated(log);
            break;
        case 'ServiceChallenged':
            await handleServiceChallenged(log);
            break;
        case 'ServiceSlashed':
            await handleServiceSlashed(log);
            break;
        case 'ChallengeResolved':
            await handleChallengeResolved(log);
            break;
        case 'ReputationUpdated':
            await handleReputationUpdated(log);
            break;
        case 'ServiceWithdrawn':
            await handleServiceWithdrawn(log);
            break;
    }
}

/**
 * Get event name from log topics
 */
function getEventName(log: Log): string | null {
    if (!log.topics || log.topics.length === 0) return null;

    // For viem logs, we need to check the first topic against known signatures
    // Since we're using watchBlockNumber + getLogs, the log object has extended properties
    const extendedLog = log as Log & { eventName?: string };
    if (extendedLog.eventName) {
        return extendedLog.eventName;
    }

    // Fallback: return null if no event name found
    return null;
}

// ============ Event Handlers ============

async function handleServiceRegistered(log: Log): Promise<void> {
    const serviceId = log.topics?.[1] as ServiceId;
    const provider = extractAddressFromTopic(log.topics?.[2]);

    if (!serviceId || !provider) return;

    console.log(`[Indexer] New service registered: ${serviceId} by ${provider}`);

    // Invalidate and rebuild service list cache (Task-46)
    await invalidateServiceListCache();

    // Create initial service cache entry
    const cacheData: ServiceCacheData = {
        id: serviceId,
        provider: provider,
        stake: '0', // Will be updated from log data
        state: 0, // Pending
        registeredAt: Date.now(),
        challengeDeadline: 0,
        challenger: null,
        reputation: null,
    };

    await setCache(
        CACHE_KEYS.serviceDetail(serviceId),
        cacheData,
        CACHE_TTL.SERVICE_DETAIL
    );

    // Rebuild list cache after registration (Task-46)
    await rebuildServiceListCache();
}

async function handleServiceActivated(log: Log): Promise<void> {
    const serviceId = log.topics?.[1] as ServiceId;
    if (!serviceId) return;

    console.log(`[Indexer] Service activated: ${serviceId}`);

    // Update service state in cache
    await updateServiceState(serviceId, 1); // Active
    await invalidateServiceListCache();
    await rebuildServiceListCache(); // Task-46
}

async function handleServiceChallenged(log: Log): Promise<void> {
    const serviceId = log.topics?.[1] as ServiceId;
    const challenger = extractAddressFromTopic(log.topics?.[2]);

    if (!serviceId) return;

    console.log(`[Indexer] Service challenged: ${serviceId} by ${challenger}`);

    // Update service state and challenger
    if (challenger) {
        await updateServiceState(serviceId, 2, { challenger }); // Challenged
    } else {
        await updateServiceState(serviceId, 2); // Challenged without challenger
    }
    await invalidateServiceListCache();
    await rebuildServiceListCache(); // Task-46
}

async function handleServiceSlashed(log: Log): Promise<void> {
    const serviceId = log.topics?.[1] as ServiceId;
    if (!serviceId) return;

    console.log(`[Indexer] Service slashed: ${serviceId}`);

    // Update service state in cache
    await updateServiceState(serviceId, 3); // Slashed
    await invalidateServiceListCache();
    await rebuildServiceListCache(); // Task-46
}

async function handleChallengeResolved(log: Log): Promise<void> {
    const serviceId = log.topics?.[1] as ServiceId;
    if (!serviceId) return;

    console.log(`[Indexer] Challenge resolved for: ${serviceId}`);

    // Cache will be refreshed on next query
    await deleteCache(CACHE_KEYS.serviceDetail(serviceId));
    await invalidateServiceListCache();
    await rebuildServiceListCache(); // Task-46
}

async function handleReputationUpdated(log: Log): Promise<void> {
    const serviceId = log.topics?.[1] as ServiceId;
    if (!serviceId) return;

    console.log(`[Indexer] Reputation updated for: ${serviceId}`);

    // Invalidate reputation cache - will fetch fresh on next query
    await deleteCache(CACHE_KEYS.reputation(serviceId));
}

async function handleServiceWithdrawn(log: Log): Promise<void> {
    const serviceId = log.topics?.[1] as ServiceId;
    if (!serviceId) return;

    console.log(`[Indexer] Service withdrawn: ${serviceId}`);

    // Update service state in cache
    await updateServiceState(serviceId, 4); // Withdrawn
    await invalidateServiceListCache();
    await rebuildServiceListCache(); // Task-46
}

// ============ Cache Helpers ============

/**
 * Update service state in cache
 */
async function updateServiceState(
    serviceId: ServiceId,
    newState: ServiceState,
    extraData?: { challenger?: Address }
): Promise<void> {
    const cached = await getCachedService(serviceId);
    if (cached) {
        cached.state = newState;
        if (extraData?.challenger) {
            cached.challenger = extraData.challenger;
        }
        await setCache(
            CACHE_KEYS.serviceDetail(serviceId),
            cached,
            CACHE_TTL.SERVICE_DETAIL
        );
    }
}

/**
 * Get cached service data
 */
async function getCachedService(serviceId: ServiceId): Promise<ServiceCacheData | null> {
    const redis = getRedis();
    const key = CACHE_KEYS.serviceDetail(serviceId);
    const cached = await redis.get(key);
    return cached ? JSON.parse(cached) : null;
}

/**
 * Invalidate service list cache (force refresh on next discover call)
 */
async function invalidateServiceListCache(): Promise<void> {
    const redis = getRedis();
    // Delete all service list cache keys (pattern match)
    const keys = await redis.keys('cortex:services:list:*');
    if (keys.length > 0) {
        await redis.del(...keys);
        console.log(`[Indexer] Invalidated ${keys.length} service list cache keys`);
    }
}

/**
 * Rebuild service list cache from individual service detail caches
 * @see Task-46: 修复 Indexer 服务列表缓存同步
 */
async function rebuildServiceListCache(): Promise<void> {
    const redis = getRedis();

    // Get all service detail cache keys
    const keys = await redis.keys('cortex:services:detail:*');
    if (keys.length === 0) {
        console.log('[Indexer] No services in cache, skipping list rebuild');
        return;
    }

    // Pipeline batch get all service details
    // Note: redis.keys() returns keys WITH prefix, but pipeline.get() adds prefix again
    // So we need to strip the prefix from keys before using them
    const keyPrefix = 'cortex:';
    const pipeline = redis.pipeline();
    keys.forEach(k => {
        const keyWithoutPrefix = k.startsWith(keyPrefix) ? k.slice(keyPrefix.length) : k;
        pipeline.get(keyWithoutPrefix);
    });
    const results = await pipeline.exec();

    // Parse and filter valid services
    const services: CachedServiceData[] = [];
    results?.forEach((result: [Error | null, unknown], index: number) => {
        if (result[0] === null && result[1]) {
            try {
                const data = JSON.parse(result[1] as string) as ServiceCacheData;
                // Convert to CachedServiceData format for list cache
                services.push({
                    id: data.id,
                    provider: data.provider,
                    stake: data.stake,
                    state: data.state,
                    metadataUri: '',
                    registeredAt: data.registeredAt,
                    challengeDeadline: data.challengeDeadline,
                    challenger: data.challenger,
                    metadata: null,
                    reputation: data.reputation ? {
                        totalCalls: data.reputation.totalCalls || 0,
                        successCount: data.reputation.successCount || 0,
                        bayesianScore: '500000000000000000', // Default 0.5e18
                        displayScore: data.reputation.bayesianScore || 50,
                        lastUpdated: Date.now(),
                    } as CachedReputationData : null,
                    rank: 0,
                });
            } catch {
                // Skip invalid cache entries
            }
        }
    });

    // Write default list cache
    if (services.length > 0) {
        const listKey = 'services:list:default';
        await redis.setex(listKey, 3600, JSON.stringify(services)); // 1 hour TTL
        console.log(`[Indexer] Rebuilt service list cache: ${services.length} services`);
    }
}

/**
 * Extract address from indexed event topic
 */
function extractAddressFromTopic(topic: Hex | undefined): Address | null {
    if (!topic) return null;
    // Topics are 32 bytes, address is 20 bytes, so take last 40 hex chars (20 bytes)
    return `0x${topic.slice(-40)}` as Address;
}

// ============ Export State ============

export { indexerState };
