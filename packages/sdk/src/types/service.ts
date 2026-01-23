/**
 * Service Types for CortexRegistry SDK
 * 
 * @description TypeScript types for on-chain service data and state management
 */

import type { MCPServiceMetadata } from './mcp.js';

// ============ Chain Types ============

/**
 * Service lifecycle states (mirrors Solidity enum)
 */
export enum ServiceState {
    Pending = 0,     // 服务已注册，等待激活
    Active = 1,      // 服务正常运行
    Challenged = 2,  // 服务被质疑，等待仲裁
    Slashed = 3,     // 服务被惩罚 (终态)
    Withdrawn = 4    // 服务主动退出 (终态)
}

/**
 * On-chain service data (mirrors Solidity struct)
 */
export interface OnChainService {
    /** Service provider address */
    provider: `0x${string}`;
    /** Amount of CRO staked (in wei) */
    stake: bigint;
    /** Current service state */
    state: ServiceState;
    /** IPFS/Arweave URI pointing to metadata */
    metadataUri: string;
    /** Block timestamp when service was registered */
    registeredAt: bigint;
    /** Block timestamp when challenge period ends (0 if not challenged) */
    challengeDeadline: bigint;
    /** Address that initiated the challenge (zero address if not challenged) */
    challenger: `0x${string}`;
}

/**
 * Service ID type (bytes32)
 */
export type ServiceId = `0x${string}`;

// ============ Enriched Types ============

/**
 * Reputation data computed off-chain
 */
export interface ReputationData {
    /** Total number of calls to this service */
    totalCalls: number;
    /** Number of successful calls */
    successCount: number;
    /** Bayesian score (0-1, 18 decimals precision) */
    bayesianScore: bigint;
    /** Human-readable score (0-100) */
    displayScore: number;
    /** Last updated timestamp */
    lastUpdated: number;
}

/**
 * Combined service data (on-chain + off-chain metadata + reputation)
 */
export interface EnrichedService {
    /** Unique service identifier */
    id: ServiceId;
    /** On-chain service data */
    onChain: OnChainService;
    /** Off-chain metadata (from IPFS/Arweave) */
    metadata: MCPServiceMetadata | null;
    /** Computed reputation data */
    reputation: ReputationData | null;
    /** Service rank in discovery results */
    rank: number;
}

// ============ Query Types ============

/**
 * Discovery query parameters
 */
export interface DiscoverQuery {
    /** Filter by capability */
    capability?: 'tools' | 'resources' | 'prompts' | 'sampling';
    /** Filter by tag */
    tag?: string;
    /** Minimum Bayesian score (0-100) */
    minScore?: number;
    /** Minimum stake in CRO */
    minStake?: number;
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
 * Discovery response
 */
export interface DiscoverResponse {
    /** List of matching services */
    services: EnrichedService[];
    /** Total count (for pagination) */
    total: number;
    /** Query execution time in ms */
    queryTimeMs: number;
}

// ============ Transaction Types ============

/**
 * Register service parameters
 */
export interface RegisterServiceParams {
    /** Metadata URI (IPFS/Arweave) */
    metadataUri: string;
    /** Stake amount in CRO */
    stakeAmount: bigint;
}

/**
 * Challenge service parameters
 */
export interface ChallengeServiceParams {
    /** Service ID to challenge */
    serviceId: ServiceId;
    /** Evidence hash */
    evidence: `0x${string}`;
    /** Reporter stake in CRO */
    reporterStake: bigint;
}

// ============ Event Types ============

/**
 * Service registered event
 */
export interface ServiceRegisteredEvent {
    serviceId: ServiceId;
    provider: `0x${string}`;
    stake: bigint;
    blockNumber: bigint;
    transactionHash: `0x${string}`;
}

/**
 * Service state changed event (generic)
 */
export interface ServiceStateChangedEvent {
    serviceId: ServiceId;
    previousState: ServiceState;
    newState: ServiceState;
    blockNumber: bigint;
    transactionHash: `0x${string}`;
}

// ============ Config Types ============

/**
 * Registry contract configuration
 */
export interface RegistryConfig {
    /** Contract address */
    address: `0x${string}`;
    /** Chain ID */
    chainId: number;
    /** Minimum stake in CRO */
    minStake: bigint;
    /** Slash ratio (percentage) */
    slashRatio: number;
    /** Challenge period in seconds */
    challengePeriod: number;
    /** Activation cooldown in seconds */
    activationCooldown: number;
    /** Reporter stake (10% of minStake) */
    reporterStake: bigint;
}

/**
 * Default Cronos testnet configuration
 */
export const DEFAULT_TESTNET_CONFIG: RegistryConfig = {
    address: '0x0000000000000000000000000000000000000000', // TBD after deployment
    chainId: 338, // Cronos testnet
    minStake: BigInt(100) * BigInt(10 ** 18), // 100 CRO
    slashRatio: 30,
    challengePeriod: 7 * 24 * 60 * 60, // 7 days
    activationCooldown: 60 * 60, // 1 hour
    reporterStake: BigInt(10) * BigInt(10 ** 18) // 10 CRO
};
