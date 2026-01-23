/**
 * Watchdog Configuration Module
 * 
 * @description Environment configuration for the Watchdog Bot
 * @see Vol.7 §2.1: Automated Watchdog
 */

import { createPublicClient, createWalletClient, http } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { cronosTestnet } from 'viem/chains';
import type { Address, Hex, PublicClient, WalletClient, Account } from 'viem';

// ============ Environment Variables ============

/**
 * Watchdog configuration loaded from environment
 */
export interface WatchdogConfig {
    /** RPC endpoints (comma-separated) */
    rpcEndpoints: string[];
    /** CortexRegistry contract address */
    registryAddress: Address;
    /** Watchdog wallet private key */
    privateKey: Hex;
    /** Health check interval in ms (default: 1 hour) */
    checkInterval: number;
    /** Failure threshold before challenge (default: 3) */
    failThreshold: number;
    /** Request timeout in ms (default: 10 seconds) */
    requestTimeout: number;
    /** Enable dry-run mode (no actual transactions) */
    dryRun: boolean;
}

/**
 * Load configuration from environment variables
 */
export function loadConfig(): WatchdogConfig {
    const rpcEndpoints = process.env.RPC_ENDPOINTS?.split(',') || [
        'https://evm-t3.cronos.org'
    ];

    const registryAddress = process.env.REGISTRY_ADDRESS as Address;
    if (!registryAddress) {
        throw new Error('REGISTRY_ADDRESS environment variable is required');
    }

    const privateKey = process.env.WATCHDOG_PRIVATE_KEY as Hex;
    if (!privateKey) {
        throw new Error('WATCHDOG_PRIVATE_KEY environment variable is required');
    }

    return {
        rpcEndpoints,
        registryAddress,
        privateKey,
        checkInterval: parseInt(process.env.CHECK_INTERVAL || '3600000'), // 1 hour
        failThreshold: parseInt(process.env.FAIL_THRESHOLD || '3'),
        requestTimeout: parseInt(process.env.REQUEST_TIMEOUT || '10000'), // 10s
        dryRun: process.env.DRY_RUN === 'true',
    };
}

// ============ Client Factory ============

/**
 * Create a public client for reading chain state
 */
export function createWatchdogPublicClient(rpcEndpoint: string): PublicClient {
    return createPublicClient({
        chain: cronosTestnet,
        transport: http(rpcEndpoint),
    });
}

/**
 * Create a wallet client for sending transactions
 */
export function createWatchdogWalletClient(
    rpcEndpoint: string,
    privateKey: Hex
): { walletClient: WalletClient; account: Account } {
    const account = privateKeyToAccount(privateKey);

    const walletClient = createWalletClient({
        account,
        chain: cronosTestnet,
        transport: http(rpcEndpoint),
    });

    return { walletClient, account };
}

// ============ Contract ABI (Minimal) ============

/**
 * Minimal ABI for CortexRegistry contract
 * Only includes functions needed by Watchdog
 */
export const REGISTRY_ABI = [
    {
        type: 'function',
        name: 'getService',
        inputs: [{ name: 'serviceId', type: 'bytes32' }],
        outputs: [
            {
                name: 'service',
                type: 'tuple',
                components: [
                    { name: 'provider', type: 'address' },
                    { name: 'stake', type: 'uint256' },
                    { name: 'state', type: 'uint8' },
                    { name: 'metadataUri', type: 'string' },
                    { name: 'registeredAt', type: 'uint256' },
                    { name: 'challengeDeadline', type: 'uint256' },
                    { name: 'challenger', type: 'address' },
                ],
            },
        ],
        stateMutability: 'view',
    },
    {
        type: 'function',
        name: 'challengeService',
        inputs: [
            { name: 'serviceId', type: 'bytes32' },
            { name: 'evidence', type: 'bytes32' },
        ],
        outputs: [],
        stateMutability: 'payable',
    },
    {
        type: 'function',
        name: 'MIN_STAKE',
        inputs: [],
        outputs: [{ name: '', type: 'uint256' }],
        stateMutability: 'view',
    },
    {
        type: 'function',
        name: 'REPORTER_STAKE',
        inputs: [],
        outputs: [{ name: '', type: 'uint256' }],
        stateMutability: 'view',
    },
] as const;

// ============ Service State Enum ============

export enum ServiceState {
    Pending = 0,
    Active = 1,
    Challenged = 2,
    Slashed = 3,
    Withdrawn = 4,
}
