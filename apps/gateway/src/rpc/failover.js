/**
 * RPC Failover Module
 *
 * @description Multi-endpoint RPC client with automatic failover
 * @see Task-19: RPC Failover
 * @see Vol.6 §2.3: RPC 故障转移
 */
import { createPublicClient, http, } from 'viem';
import { cronosTestnet } from 'viem/chains';
/**
 * Default RPC endpoints for Cronos Testnet (from Vol.6 §2.3)
 */
const DEFAULT_RPC_ENDPOINTS = [
    { url: 'https://evm-t3.cronos.org', priority: 1, label: 'primary' },
    { url: 'https://cronos-testnet.drpc.org', priority: 2, label: 'backup' },
    { url: 'https://testnet.cronos.org', priority: 3, label: 'fallback' },
];
const DEFAULT_CONFIG = {
    maxRetries: 3,
    timeout: 10000, // 10 seconds
    recoveryDelay: 30000, // 30 seconds
    maxConsecutiveFailures: 3,
};
// ============ State ============
let endpoints = [];
let config = DEFAULT_CONFIG;
let clientCache = new Map();
// ============ Initialization ============
/**
 * Initialize the failover system
 */
export function initFailover(customEndpoints, customConfig) {
    const rawEndpoints = customEndpoints || DEFAULT_RPC_ENDPOINTS;
    endpoints = rawEndpoints.map(ep => ({
        ...ep,
        isHealthy: true,
        lastFailure: 0,
        failureCount: 0,
    }));
    // Sort by priority
    endpoints.sort((a, b) => a.priority - b.priority);
    config = { ...DEFAULT_CONFIG, ...customConfig };
    clientCache.clear();
    console.log(`[RPC Failover] Initialized with ${endpoints.length} endpoints`);
}
/**
 * Get status of all endpoints
 */
export function getEndpointStatus() {
    return [...endpoints];
}
// ============ Client Management ============
/**
 * Get a PublicClient for the given endpoint
 */
function getClient(endpoint) {
    if (!clientCache.has(endpoint.url)) {
        const client = createPublicClient({
            chain: cronosTestnet,
            transport: http(endpoint.url, {
                timeout: config.timeout,
            }),
        });
        clientCache.set(endpoint.url, client);
    }
    return clientCache.get(endpoint.url);
}
/**
 * Get the currently healthy endpoints, sorted by priority
 */
function getHealthyEndpoints() {
    const now = Date.now();
    return endpoints
        .filter(ep => {
        // Endpoint is healthy OR enough time has passed since last failure
        if (ep.isHealthy)
            return true;
        return (now - ep.lastFailure) > config.recoveryDelay;
    })
        .sort((a, b) => a.priority - b.priority);
}
/**
 * Mark an endpoint as failed
 */
function markEndpointFailed(endpoint) {
    endpoint.failureCount++;
    endpoint.lastFailure = Date.now();
    if (endpoint.failureCount >= config.maxConsecutiveFailures) {
        endpoint.isHealthy = false;
        console.warn(`[RPC Failover] Endpoint ${endpoint.label} marked unhealthy after ${endpoint.failureCount} failures`);
    }
}
/**
 * Mark an endpoint as successful
 */
function markEndpointSuccess(endpoint) {
    endpoint.failureCount = 0;
    endpoint.isHealthy = true;
}
// ============ Core Failover Function ============
/**
 * Execute a function with automatic failover across endpoints
 */
export async function executeWithFailover(fn, options) {
    const retries = options?.maxRetries ?? config.maxRetries;
    const errors = [];
    // Initialize if not done
    if (endpoints.length === 0) {
        initFailover();
    }
    const healthyEndpoints = getHealthyEndpoints();
    if (healthyEndpoints.length === 0) {
        // All endpoints unhealthy, try all anyway
        console.warn('[RPC Failover] All endpoints unhealthy, attempting recovery...');
        endpoints.forEach(ep => {
            ep.isHealthy = true;
            ep.failureCount = 0;
        });
    }
    const endpointsToTry = healthyEndpoints.length > 0 ? healthyEndpoints : endpoints;
    for (let attempt = 0; attempt < retries; attempt++) {
        for (const endpoint of endpointsToTry) {
            try {
                const client = getClient(endpoint);
                const result = await fn(client);
                markEndpointSuccess(endpoint);
                return result;
            }
            catch (error) {
                const err = error instanceof Error ? error : new Error(String(error));
                errors.push(err);
                markEndpointFailed(endpoint);
                console.warn(`[RPC Failover] ${endpoint.label} failed: ${err.message}`);
            }
        }
    }
    throw new AggregateError(errors, `All RPC endpoints failed after ${retries} attempts`);
}
// ============ Convenience Methods ============
/**
 * Get the current block number with failover
 */
export async function getBlockNumber() {
    return executeWithFailover(client => client.getBlockNumber());
}
/**
 * Get a transaction receipt with failover
 */
export async function getTransactionReceipt(hash) {
    return executeWithFailover(client => client.getTransactionReceipt({ hash }));
}
/**
 * Get logs with failover
 */
export async function getLogs(params) {
    return executeWithFailover(client => client.getLogs(params));
}
/**
 * Get balance with failover
 */
export async function getBalance(address) {
    return executeWithFailover(client => client.getBalance({ address }));
}
/**
 * Read contract with failover
 */
export async function readContract(params) {
    return executeWithFailover(client => client.readContract(params));
}
/**
 * Get a healthy client for direct use (e.g., for watchers)
 */
export function getHealthyClient() {
    if (endpoints.length === 0) {
        initFailover();
    }
    const healthy = getHealthyEndpoints();
    const endpoint = healthy[0] ?? endpoints[0];
    if (!endpoint) {
        throw new Error('[RPC Failover] No endpoints available');
    }
    return getClient(endpoint);
}
// ============ Health Check ============
/**
 * Check health of all endpoints
 */
export async function checkAllEndpointsHealth() {
    const details = [];
    for (const endpoint of endpoints) {
        const start = Date.now();
        try {
            const client = getClient(endpoint);
            await client.getBlockNumber();
            const latency = Date.now() - start;
            markEndpointSuccess(endpoint);
            details.push({ label: endpoint.label, healthy: true, latency });
        }
        catch {
            markEndpointFailed(endpoint);
            details.push({ label: endpoint.label, healthy: false });
        }
    }
    return {
        healthy: details.filter(d => d.healthy).length,
        unhealthy: details.filter(d => !d.healthy).length,
        details,
    };
}
// ============ Export Config ============
export { DEFAULT_RPC_ENDPOINTS, DEFAULT_CONFIG };
//# sourceMappingURL=failover.js.map