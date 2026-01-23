/**
 * Activate Pending Services Script
 * 
 * @description Batch activate all services stuck in Pending state
 * @task Phase 4.2 - Fix Task-55 dirty ops
 * 
 * Usage:
 *   npx tsx activate-pending-services.ts
 * 
 * Environment:
 *   REGISTRY_ADDRESS - CortexRegistry contract address
 *   DEPLOYER_PRIVATE_KEY - Deployer wallet private key (with TCRO)
 */

import { config as dotenvConfig } from 'dotenv';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

// ESM compatibility
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Load .env from project root
dotenvConfig({ path: resolve(__dirname, '..', '.env') });
import {
    createPublicClient,
    createWalletClient,
    http,
    parseAbiItem,
    defineChain,
    getAddress,
    type Address,
    type Hex,
    type Log,
} from 'viem';
import { privateKeyToAccount } from 'viem/accounts';

// ============ Custom Cronos Testnet Chain Definition ============
const cronosTestnet = defineChain({
    id: 338,
    name: 'Cronos Testnet',
    nativeCurrency: {
        name: 'Test CRO',
        symbol: 'TCRO',
        decimals: 18,
    },
    rpcUrls: {
        default: { http: ['https://evm-t3.cronos.org'] },
    },
    blockExplorers: {
        default: { name: 'Cronos Explorer', url: 'https://explorer.cronos.org/testnet' },
    },
});

// ============ Configuration ============

const config = {
    rpcEndpoint: process.env.RPC_ENDPOINTS?.split(',')[0] || 'https://evm-t3.cronos.org',
    registryAddress: getAddress(process.env.REGISTRY_ADDRESS || '0xffe6969bb8799ec86631d9d1bb9fcd9779cd3fd2'),
    privateKey: (process.env.DEPLOYER_PRIVATE_KEY || process.env.TEST_PRIVATE_KEY) as Hex,
    startBlock: BigInt(process.env.START_BLOCK || '68736000'), // Contract deployment block
};

// ============ Contract ABI ============

const REGISTRY_ABI = [
    {
        type: 'function',
        name: 'activateService',
        inputs: [{ name: 'serviceId', type: 'bytes32' }],
        outputs: [],
        stateMutability: 'nonpayable',
    },
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
        name: 'ACTIVATION_COOLDOWN',
        inputs: [],
        outputs: [{ name: '', type: 'uint256' }],
        stateMutability: 'view',
    },
] as const;

const ServiceRegisteredEvent = parseAbiItem('event ServiceRegistered(bytes32 indexed serviceId, address indexed provider, uint256 stake)');

// ============ Types ============

interface ServiceInfo {
    serviceId: Hex;
    provider: Address;
    state: number;
    registeredAt: bigint;
}

// ============ State Names ============

const STATE_NAMES = ['Pending', 'Active', 'Challenged', 'Slashed', 'Withdrawn'];

// ============ Main ============

async function main(): Promise<void> {
    console.log('╔════════════════════════════════════════════╗');
    console.log('║   Activate Pending Services - Phase 4.2    ║');
    console.log('╚════════════════════════════════════════════╝');
    console.log('');

    // Validate config
    if (!config.privateKey) {
        console.error('❌ DEPLOYER_PRIVATE_KEY or TEST_PRIVATE_KEY environment variable required');
        process.exit(1);
    }

    console.log(`Registry: ${config.registryAddress}`);
    console.log(`RPC: ${config.rpcEndpoint}`);
    console.log('');

    // Setup clients
    const account = privateKeyToAccount(config.privateKey);

    const publicClient = createPublicClient({
        chain: cronosTestnet,
        transport: http(config.rpcEndpoint),
    });

    const walletClient = createWalletClient({
        account,
        chain: cronosTestnet,
        transport: http(config.rpcEndpoint),
    });

    console.log(`Wallet: ${account.address}`);

    const balance = await publicClient.getBalance({ address: account.address });
    console.log(`Balance: ${Number(balance) / 1e18} CRO`);
    console.log('');

    // Get activation cooldown
    const cooldown = await publicClient.readContract({
        address: config.registryAddress,
        abi: REGISTRY_ABI,
        functionName: 'ACTIVATION_COOLDOWN',
    });
    console.log(`ACTIVATION_COOLDOWN: ${cooldown} seconds (${Number(cooldown) / 3600} hours)`);
    console.log('');

    // Step 1: Fetch all ServiceRegistered events
    console.log('════════════════════════════════════════════');
    console.log('▶ Step 1: Scanning for registered services...');
    console.log('');

    const currentBlock = await publicClient.getBlockNumber();
    const BATCH_SIZE = BigInt(2000);

    const allServiceIds: Hex[] = [];

    for (let fromBlock = config.startBlock; fromBlock <= currentBlock; fromBlock += BATCH_SIZE) {
        const toBlock = fromBlock + BATCH_SIZE - BigInt(1) > currentBlock
            ? currentBlock
            : fromBlock + BATCH_SIZE - BigInt(1);

        try {
            const logs = await publicClient.getLogs({
                address: config.registryAddress,
                event: ServiceRegisteredEvent,
                fromBlock,
                toBlock,
            });

            for (const log of logs) {
                if (log.topics[1]) {
                    allServiceIds.push(log.topics[1] as Hex);
                }
            }

            if (logs.length > 0) {
                console.log(`  Batch ${fromBlock}-${toBlock}: found ${logs.length} registrations`);
            }
        } catch (error) {
            console.warn(`  ⚠ Error scanning blocks ${fromBlock}-${toBlock}: ${error}`);
        }
    }

    console.log('');
    console.log(`Found ${allServiceIds.length} total registered services`);
    console.log('');

    // Step 2: Filter for Pending services owned by this wallet
    console.log('════════════════════════════════════════════');
    console.log('▶ Step 2: Filtering for activatable services...');
    console.log('');

    const pendingServices: ServiceInfo[] = [];
    const now = BigInt(Math.floor(Date.now() / 1000));

    for (const serviceId of allServiceIds) {
        try {
            const service = await publicClient.readContract({
                address: config.registryAddress,
                abi: REGISTRY_ABI,
                functionName: 'getService',
                args: [serviceId],
            });

            // Check if:
            // 1. State is Pending (0)
            // 2. Provider is our wallet
            // 3. Cooldown has passed
            const cooldownEnd = service.registeredAt + cooldown;
            const canActivate =
                service.state === 0 &&
                service.provider.toLowerCase() === account.address.toLowerCase() &&
                now >= cooldownEnd;

            if (service.state === 0) {
                console.log(`  ${serviceId.slice(0, 18)}...`);
                console.log(`    State: Pending`);
                console.log(`    Provider: ${service.provider}`);
                console.log(`    Owner Match: ${service.provider.toLowerCase() === account.address.toLowerCase() ? '✅' : '❌'}`);
                console.log(`    Cooldown: ${now >= cooldownEnd ? '✅ Passed' : `❌ ${Number(cooldownEnd - now)}s remaining`}`);
                console.log(`    Activatable: ${canActivate ? '✅' : '❌'}`);
                console.log('');

                if (canActivate) {
                    pendingServices.push({
                        serviceId,
                        provider: service.provider,
                        state: service.state,
                        registeredAt: service.registeredAt,
                    });
                }
            }
        } catch (error) {
            // Service might not exist or other error
            console.warn(`  ⚠ Error reading service ${serviceId.slice(0, 18)}...: ${error}`);
        }
    }

    if (pendingServices.length === 0) {
        console.log('════════════════════════════════════════════');
        console.log('✅ No pending services to activate!');
        console.log('   All your services are already Active or not owned by this wallet.');
        process.exit(0);
    }

    console.log(`Found ${pendingServices.length} activatable Pending services`);
    console.log('');

    // Step 3: Activate services
    console.log('════════════════════════════════════════════');
    console.log('▶ Step 3: Activating services...');
    console.log('');

    let successCount = 0;
    let failCount = 0;

    for (const service of pendingServices) {
        console.log(`  Activating ${service.serviceId.slice(0, 18)}...`);

        try {
            const hash = await walletClient.writeContract({
                address: config.registryAddress,
                abi: REGISTRY_ABI,
                functionName: 'activateService',
                args: [service.serviceId],
                chain: cronosTestnet,
                account,
                // Cronos EIP-1559 gas fix
                gas: 200000n,
                maxFeePerGas: 5000000000000n,
            });

            console.log(`    TX: ${hash}`);

            const receipt = await publicClient.waitForTransactionReceipt({ hash });

            if (receipt.status === 'success') {
                console.log(`    ✅ Activated!`);
                successCount++;
            } else {
                console.log(`    ❌ Transaction failed`);
                failCount++;
            }
        } catch (error) {
            console.log(`    ❌ Error: ${error}`);
            failCount++;
        }

        console.log('');
    }

    // Step 4: Verify final states
    console.log('════════════════════════════════════════════');
    console.log('▶ Step 4: Verifying final states...');
    console.log('');

    for (const service of pendingServices) {
        try {
            const finalService = await publicClient.readContract({
                address: config.registryAddress,
                abi: REGISTRY_ABI,
                functionName: 'getService',
                args: [service.serviceId],
            });

            console.log(`  ${service.serviceId.slice(0, 18)}... → ${STATE_NAMES[finalService.state]} (${finalService.state})`);
        } catch (error) {
            console.log(`  ${service.serviceId.slice(0, 18)}... → ❌ Error reading state`);
        }
    }

    console.log('');
    console.log('════════════════════════════════════════════');
    console.log('📊 Summary');
    console.log(`   Total Pending: ${pendingServices.length}`);
    console.log(`   ✅ Activated: ${successCount}`);
    console.log(`   ❌ Failed: ${failCount}`);
    console.log('');
    console.log('Next steps:');
    console.log('  1. Restart Gateway to resync: pnpm --filter gateway dev');
    console.log('  2. Verify: curl http://localhost:3001/v1/discover');
    console.log('  3. Check Dashboard Star Map');
}

main().catch((error) => {
    console.error('Fatal error:', error);
    process.exit(1);
});
