/**
 * Watchdog Bot
 * 
 * @description Automated health checker that challenges unhealthy services
 * @see Vol.7 §2.1: Automated Watchdog
 * @see Task-21: Impl Watchdog Bot
 * 
 * Usage:
 *   npx ts-node watchdog.ts [--dry-run] [--single-run]
 * 
 * Environment:
 *   REGISTRY_ADDRESS - CortexRegistry contract address
 *   WATCHDOG_PRIVATE_KEY - Wallet private key for sending challenges
 *   RPC_ENDPOINTS - Comma-separated RPC endpoints
 *   CHECK_INTERVAL - Interval between checks in ms (default: 3600000)
 *   FAIL_THRESHOLD - Failures before challenge (default: 3)
 */

import { keccak256, encodePacked, type Address, type Hex } from 'viem';
import {
    loadConfig,
    createWatchdogPublicClient,
    createWatchdogWalletClient,
    REGISTRY_ABI,
    ServiceState,
    type WatchdogConfig,
} from './config.js';
import { Logger, watchdogLogger } from './logger.js';

// ============ Types ============

interface ServiceInfo {
    id: Hex;
    provider: Address;
    state: ServiceState;
    metadataUri: string;
    healthEndpoint?: string;
}

interface HealthCheckResult {
    serviceId: Hex;
    healthy: boolean;
    latencyMs?: number;
    error?: string;
}

interface FailureTracker {
    [serviceId: string]: {
        count: number;
        lastCheck: Date;
        errors: string[];
    };
}

// ============ State ============

const failures: FailureTracker = {};
let isRunning = false;
let checkCount = 0;

// ============ Core Functions ============

/**
 * Parse health endpoint from metadata URI
 * Assumes metadata is IPFS or HTTP JSON with "healthEndpoint" field
 */
async function parseHealthEndpoint(metadataUri: string, logger: Logger): Promise<string | null> {
    try {
        // For IPFS, convert to gateway URL
        let fetchUrl = metadataUri;
        if (metadataUri.startsWith('ipfs://')) {
            const cid = metadataUri.replace('ipfs://', '');
            fetchUrl = `https://ipfs.io/ipfs/${cid}`;
        }

        // Fetch metadata with timeout
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 5000);

        const response = await fetch(fetchUrl, { signal: controller.signal });
        clearTimeout(timeout);

        if (!response.ok) {
            return null;
        }

        const metadata = await response.json();
        return metadata.healthEndpoint || metadata.endpoint || null;
    } catch (error) {
        logger.debug(`Failed to parse metadata: ${metadataUri}`, { error: String(error) });
        return null;
    }
}

/**
 * Perform health check on a service endpoint
 */
async function checkHealth(
    service: ServiceInfo,
    timeout: number,
    logger: Logger
): Promise<HealthCheckResult> {
    const startTime = Date.now();

    if (!service.healthEndpoint) {
        return {
            serviceId: service.id,
            healthy: false,
            error: 'No health endpoint configured',
        };
    }

    try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), timeout);

        const response = await fetch(service.healthEndpoint, {
            method: 'HEAD',
            signal: controller.signal,
        });

        clearTimeout(timeoutId);
        const latencyMs = Date.now() - startTime;

        return {
            serviceId: service.id,
            healthy: response.ok,
            latencyMs,
            error: response.ok ? undefined : `HTTP ${response.status}`,
        };
    } catch (error) {
        return {
            serviceId: service.id,
            healthy: false,
            latencyMs: Date.now() - startTime,
            error: error instanceof Error ? error.message : 'Unknown error',
        };
    }
}

/**
 * Generate evidence hash from failure data
 */
function generateEvidenceHash(
    serviceId: Hex,
    failureCount: number,
    errors: string[]
): Hex {
    const data = JSON.stringify({
        serviceId,
        failureCount,
        errors: errors.slice(-3), // Last 3 errors
        timestamp: Date.now(),
    });

    return keccak256(encodePacked(['string'], [data]));
}

/**
 * Challenge a malicious/unhealthy service
 */
async function challengeService(
    serviceId: Hex,
    config: WatchdogConfig,
    logger: Logger
): Promise<boolean> {
    try {
        const failData = failures[serviceId];
        const evidenceHash = generateEvidenceHash(
            serviceId,
            failData.count,
            failData.errors
        );

        if (config.dryRun) {
            logger.info(`[DRY-RUN] Would challenge service ${serviceId}`, {
                evidenceHash,
                failureCount: failData.count,
            });
            return true;
        }

        // Get reporter stake requirement
        const publicClient = createWatchdogPublicClient(config.rpcEndpoints[0]);
        const reporterStake = await publicClient.readContract({
            address: config.registryAddress,
            abi: REGISTRY_ABI,
            functionName: 'REPORTER_STAKE',
        });

        // Create wallet client
        const { walletClient, account } = createWatchdogWalletClient(
            config.rpcEndpoints[0],
            config.privateKey
        );

        logger.info(`Challenging service ${serviceId}`, {
            reporterStake: reporterStake.toString(),
            evidenceHash,
        });

        // Send challenge transaction
        const hash = await walletClient.writeContract({
            address: config.registryAddress,
            abi: REGISTRY_ABI,
            functionName: 'challengeService',
            args: [serviceId, evidenceHash],
            value: reporterStake,
            chain: undefined, // Use client chain
            account,
        });

        logger.info(`Challenge submitted: ${hash}`, { serviceId });

        // Wait for confirmation
        const receipt = await publicClient.waitForTransactionReceipt({ hash });

        if (receipt.status === 'success') {
            logger.info(`Challenge confirmed: ${hash}`, {
                serviceId,
                blockNumber: receipt.blockNumber.toString(),
            });
            // Reset failure counter after successful challenge
            delete failures[serviceId];
            return true;
        } else {
            logger.error(`Challenge failed: ${hash}`, { serviceId });
            return false;
        }
    } catch (error) {
        logger.error(`Failed to challenge service: ${String(error)}`, { serviceId });
        return false;
    }
}

/**
 * Fetch active services from Redis cache or chain
 */
async function fetchActiveServices(
    config: WatchdogConfig,
    logger: Logger
): Promise<ServiceInfo[]> {
    // TODO: In production, fetch from Redis cache or Gateway API
    // For now, we'll return empty array as we don't have a list of all services
    // The full implementation would query the Gateway's /v1/discover endpoint

    logger.debug('Fetching active services from Gateway...');

    try {
        const gatewayUrl = process.env.GATEWAY_URL || 'http://localhost:3001';
        const response = await fetch(`${gatewayUrl}/v1/discover?limit=100`);

        if (!response.ok) {
            logger.warn(`Gateway returned ${response.status}`);
            return [];
        }

        const data = await response.json();
        const services: ServiceInfo[] = [];

        for (const svc of data.services || []) {
            if (svc.state === ServiceState.Active) {
                const healthEndpoint = await parseHealthEndpoint(svc.metadataUri, logger);
                services.push({
                    id: svc.id as Hex,
                    provider: svc.provider as Address,
                    state: svc.state,
                    metadataUri: svc.metadataUri,
                    healthEndpoint: healthEndpoint || undefined,
                });
            }
        }

        logger.info(`Found ${services.length} active services`);
        return services;
    } catch (error) {
        logger.error(`Failed to fetch services: ${String(error)}`);
        return [];
    }
}

/**
 * Run a single health check cycle
 */
async function runCheckCycle(config: WatchdogConfig, logger: Logger): Promise<void> {
    checkCount++;
    logger.info(`Starting check cycle #${checkCount}`);

    const services = await fetchActiveServices(config, logger);

    if (services.length === 0) {
        logger.info('No active services to check');
        return;
    }

    let healthyCount = 0;
    let unhealthyCount = 0;
    let challengedCount = 0;

    for (const service of services) {
        const result = await checkHealth(service, config.requestTimeout, logger);

        if (result.healthy) {
            healthyCount++;
            // Reset failure count on healthy response
            if (failures[service.id]) {
                logger.debug(`Service recovered: ${service.id}`);
                delete failures[service.id];
            }
        } else {
            unhealthyCount++;

            // Track failure
            if (!failures[service.id]) {
                failures[service.id] = {
                    count: 0,
                    lastCheck: new Date(),
                    errors: [],
                };
            }

            failures[service.id].count++;
            failures[service.id].lastCheck = new Date();
            failures[service.id].errors.push(result.error || 'Unknown');

            logger.warn(`Service unhealthy: ${service.id}`, {
                failCount: failures[service.id].count,
                error: result.error,
            });

            // Challenge if threshold reached
            if (failures[service.id].count >= config.failThreshold) {
                logger.info(`Threshold reached for ${service.id}, initiating challenge`);
                const challenged = await challengeService(service.id, config, logger);
                if (challenged) {
                    challengedCount++;
                }
            }
        }
    }

    logger.info(`Check cycle #${checkCount} complete`, {
        total: services.length,
        healthy: healthyCount,
        unhealthy: unhealthyCount,
        challenged: challengedCount,
    });
}

/**
 * Main entry point
 */
async function main(): Promise<void> {
    const args = process.argv.slice(2);
    const singleRun = args.includes('--single-run');

    // Override dry-run from CLI
    if (args.includes('--dry-run')) {
        process.env.DRY_RUN = 'true';
    }

    watchdogLogger.info('Watchdog Bot starting...', {
        version: '1.0.0',
        singleRun,
        dryRun: process.env.DRY_RUN === 'true',
    });

    let config: WatchdogConfig;
    try {
        config = loadConfig();
    } catch (error) {
        watchdogLogger.error(`Configuration error: ${String(error)}`);
        process.exit(1);
    }

    watchdogLogger.info('Configuration loaded', {
        registryAddress: config.registryAddress,
        checkIntervalMs: config.checkInterval,
        failThreshold: config.failThreshold,
        dryRun: config.dryRun,
    });

    isRunning = true;

    // Handle graceful shutdown
    process.on('SIGINT', () => {
        watchdogLogger.info('Received SIGINT, shutting down...');
        isRunning = false;
    });

    process.on('SIGTERM', () => {
        watchdogLogger.info('Received SIGTERM, shutting down...');
        isRunning = false;
    });

    // Run check cycles
    if (singleRun) {
        await runCheckCycle(config, watchdogLogger);
        watchdogLogger.info('Single run complete, exiting');
    } else {
        while (isRunning) {
            await runCheckCycle(config, watchdogLogger);

            if (isRunning) {
                watchdogLogger.debug(`Sleeping for ${config.checkInterval}ms`);
                await new Promise(resolve => setTimeout(resolve, config.checkInterval));
            }
        }
    }

    watchdogLogger.info('Watchdog Bot stopped');
}

// ============ Run ============

main().catch((error) => {
    watchdogLogger.error(`Fatal error: ${String(error)}`);
    process.exit(1);
});
