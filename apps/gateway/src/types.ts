/**
 * Local Type Definitions for Gateway
 * 
 * @description Types mirrored from SDK for Gateway internal use
 * @note These should eventually be imported from @cortex-registry/sdk
 */

// ============ Chain Types ============

/**
 * Service lifecycle states (mirrors Solidity enum)
 */
export enum ServiceState {
    Pending = 0,
    Active = 1,
    Challenged = 2,
    Slashed = 3,
    Withdrawn = 4
}

/**
 * Service ID type (bytes32)
 */
export type ServiceId = `0x${string}`;

/**
 * On-chain service data
 */
export interface OnChainService {
    provider: `0x${string}`;
    stake: bigint;
    state: ServiceState;
    metadataUri: string;
    registeredAt: bigint;
    challengeDeadline: bigint;
    challenger: `0x${string}`;
}

/**
 * Reputation data computed off-chain
 */
export interface ReputationData {
    totalCalls: number;
    successCount: number;
    bayesianScore: bigint;
    displayScore: number;
    lastUpdated: number;
}

/**
 * MCP Service Metadata
 */
export interface MCPServiceMetadata {
    name: string;
    version: string;
    description: string;
    endpoint: string;
    category?: string;
    tags?: string[];
    capabilities?: string[];
    pricing?: {
        currency: string;
        pricePerCall: string;
    };
}

/**
 * Combined service data (on-chain + off-chain + reputation)
 */
export interface EnrichedService {
    id: ServiceId;
    onChain: OnChainService;
    metadata: MCPServiceMetadata | null;
    reputation: ReputationData | null;
    rank: number;
}
