/**
 * RPC Failover Module
 *
 * @description Multi-endpoint RPC client with automatic failover
 * @see Task-19: RPC Failover
 * @see Vol.6 §2.3: RPC 故障转移
 */
import { type PublicClient, type Address, type Hex, type TransactionReceipt, type Log } from 'viem';
/**
 * RPC endpoint configuration
 */
export interface RPCEndpoint {
    /** RPC URL */
    url: string;
    /** Priority (lower = higher priority) */
    priority: number;
    /** Human-readable label */
    label: string;
    /** Whether this endpoint is currently healthy */
    isHealthy: boolean;
    /** Last failure timestamp */
    lastFailure: number;
    /** Consecutive failure count */
    failureCount: number;
}
/**
 * Default RPC endpoints for Cronos Testnet (from Vol.6 §2.3)
 */
declare const DEFAULT_RPC_ENDPOINTS: Omit<RPCEndpoint, 'isHealthy' | 'lastFailure' | 'failureCount'>[];
/**
 * Failover configuration
 */
export interface FailoverConfig {
    /** Maximum retry attempts per request */
    maxRetries: number;
    /** Request timeout in ms */
    timeout: number;
    /** Time to wait before retrying a failed endpoint (ms) */
    recoveryDelay: number;
    /** Maximum consecutive failures before marking unhealthy */
    maxConsecutiveFailures: number;
}
declare const DEFAULT_CONFIG: FailoverConfig;
/**
 * Initialize the failover system
 */
export declare function initFailover(customEndpoints?: Array<{
    url: string;
    priority: number;
    label: string;
}>, customConfig?: Partial<FailoverConfig>): void;
/**
 * Get status of all endpoints
 */
export declare function getEndpointStatus(): RPCEndpoint[];
/**
 * Execute a function with automatic failover across endpoints
 */
export declare function executeWithFailover<T>(fn: (client: PublicClient) => Promise<T>, options?: {
    maxRetries?: number;
}): Promise<T>;
/**
 * Get the current block number with failover
 */
export declare function getBlockNumber(): Promise<bigint>;
/**
 * Get a transaction receipt with failover
 */
export declare function getTransactionReceipt(hash: Hex): Promise<TransactionReceipt | null>;
/**
 * Get logs with failover
 */
export declare function getLogs(params: {
    address?: Address;
    event?: any;
    events?: any[];
    fromBlock?: bigint;
    toBlock?: bigint;
}): Promise<Log[]>;
/**
 * Get balance with failover
 */
export declare function getBalance(address: Address): Promise<bigint>;
/**
 * Read contract with failover
 */
export declare function readContract<T>(params: {
    address: Address;
    abi: any;
    functionName: string;
    args?: any[];
}): Promise<T>;
/**
 * Get a healthy client for direct use (e.g., for watchers)
 */
export declare function getHealthyClient(): PublicClient;
/**
 * Check health of all endpoints
 */
export declare function checkAllEndpointsHealth(): Promise<{
    healthy: number;
    unhealthy: number;
    details: Array<{
        label: string;
        healthy: boolean;
        latency?: number;
    }>;
}>;
export { DEFAULT_RPC_ENDPOINTS, DEFAULT_CONFIG };
//# sourceMappingURL=failover.d.ts.map