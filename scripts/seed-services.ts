/**
 * Seed Services Script
 * 
 * @description Register test services for E2E Dashboard verification
 * @task Task-33c
 * 
 * Usage:
 *   npx tsx seed-services.ts
 * 
 * Environment:
 *   REGISTRY_ADDRESS - CortexRegistry contract address
 *   DEPLOYER_PRIVATE_KEY - Deployer wallet private key (with TCRO)
 */

import 'dotenv/config';
import {
    createPublicClient,
    createWalletClient,
    http,
    parseEther,
    defineChain,
    getAddress,
    type Address,
    type Hex,
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
    minStake: parseEther('10'), // 10 CRO
};

// ============ Contract ABI ============

const REGISTRY_ABI = [
    {
        type: 'function',
        name: 'registerService',
        inputs: [{ name: 'metadataUri', type: 'string' }],
        outputs: [{ name: 'serviceId', type: 'bytes32' }],
        stateMutability: 'payable',
    },
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
    {
        type: 'function',
        name: 'MIN_STAKE',
        inputs: [],
        outputs: [{ name: '', type: 'uint256' }],
        stateMutability: 'view',
    },
] as const;

// ============ Test Service Metadata ============

const testServices = [
    {
        name: 'Cortex Knowledge Base',
        description: 'AI-powered knowledge graph and semantic search',
        capabilities: ['knowledge-graph', 'semantic-search', 'embeddings'],
        pricePerCall: '0.001',
        endpoint: 'https://api.cortex.demo/knowledge',
    },
    {
        name: 'Vision Analyzer',
        description: 'Multi-modal image analysis and object detection',
        capabilities: ['image-analysis', 'object-detection', 'ocr'],
        pricePerCall: '0.002',
        endpoint: 'https://api.cortex.demo/vision',
    },
    {
        name: 'Code Synthesizer',
        description: 'Advanced code generation and refactoring',
        capabilities: ['code-gen', 'refactoring', 'test-gen'],
        pricePerCall: '0.005',
        endpoint: 'https://api.cortex.demo/code',
    },
    {
        name: 'Data Transformer',
        description: 'Schema transformation and data pipeline orchestration',
        capabilities: ['etl', 'schema-mapping', 'streaming'],
        pricePerCall: '0.003',
        endpoint: 'https://api.cortex.demo/transform',
    },
    {
        name: 'Security Sentinel',
        description: 'Smart contract auditing and vulnerability detection',
        capabilities: ['audit', 'vulnerability-scan', 'compliance'],
        pricePerCall: '0.01',
        endpoint: 'https://api.cortex.demo/security',
    },
];

// ============ Main ============

async function main(): Promise<void> {
    console.log('╔════════════════════════════════════════════╗');
    console.log('║      Seed Services - Task-33c              ║');
    console.log('╚════════════════════════════════════════════╝');
    console.log('');

    // Validate config
    if (!config.privateKey) {
        console.error('❌ TEST_PRIVATE_KEY environment variable required');
        console.log('   Example: $env:TEST_PRIVATE_KEY="0x..."');
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
    console.log(`Balance: ${balance} wei (${Number(balance) / 1e18} CRO)`);
    console.log('');

    // Read contract constants
    const minStake = await publicClient.readContract({
        address: config.registryAddress,
        abi: REGISTRY_ABI,
        functionName: 'MIN_STAKE',
    });
    console.log(`MIN_STAKE: ${minStake} wei (${Number(minStake) / 1e18} CRO)`);

    const cooldown = await publicClient.readContract({
        address: config.registryAddress,
        abi: REGISTRY_ABI,
        functionName: 'ACTIVATION_COOLDOWN',
    });
    console.log(`ACTIVATION_COOLDOWN: ${cooldown} seconds`);
    console.log('');

    // Check balance and adjust service count if needed
    const requiredBalance = minStake * BigInt(testServices.length);
    let servicesToRegister = testServices;
    if (balance < requiredBalance) {
        const maxServices = Number(balance / minStake);
        if (maxServices < 1) {
            console.error(`❌ Insufficient balance. Need at least ${Number(minStake) / 1e18} CRO, have ${Number(balance) / 1e18} CRO`);
            process.exit(1);
        }
        console.log(`⚠ Balance only allows ${maxServices} services (need ${Number(minStake) / 1e18} CRO each)`);
        servicesToRegister = testServices.slice(0, maxServices);
    }

    // Register services
    const serviceIds: Hex[] = [];

    for (let i = 0; i < servicesToRegister.length; i++) {
        const service = servicesToRegister[i];
        console.log(`▶ Registering Service ${i + 1}/${servicesToRegister.length}: ${service.name}`);

        // Create metadata URI (for demo, just use JSON-stringified data)
        const metadataUri = `data:application/json,${encodeURIComponent(JSON.stringify(service))}`;

        try {
            const hash = await walletClient.writeContract({
                address: config.registryAddress,
                abi: REGISTRY_ABI,
                functionName: 'registerService',
                args: [metadataUri],
                value: minStake,
                chain: cronosTestnet,
                account,
            });

            console.log(`  TX Hash: ${hash}`);

            const receipt = await publicClient.waitForTransactionReceipt({ hash });

            if (receipt.status !== 'success') {
                console.log(`  ❌ Transaction failed`);
                continue;
            }

            // Extract serviceId from logs
            const log = receipt.logs[0];
            if (log && log.topics[1]) {
                const serviceId = log.topics[1] as Hex;
                serviceIds.push(serviceId);
                console.log(`  Service ID: ${serviceId}`);
                console.log(`  ✅ Registered`);
            }
        } catch (error) {
            console.log(`  ❌ Error: ${error}`);
        }

        console.log('');
    }

    // Wait for cooldown (if short enough)
    const waitSeconds = Number(cooldown);
    if (waitSeconds <= 60) {
        console.log(`⏳ Waiting ${waitSeconds + 5}s for activation cooldown...`);
        await new Promise(resolve => setTimeout(resolve, (waitSeconds + 5) * 1000));
    } else {
        console.log(`⚠ Cooldown is ${waitSeconds}s, skipping wait. Services will remain Pending.`);
        console.log('  Run activation manually after cooldown.');
    }

    // Activate services
    console.log('');
    console.log('▶ Activating Services');

    for (const serviceId of serviceIds) {
        try {
            const hash = await walletClient.writeContract({
                address: config.registryAddress,
                abi: REGISTRY_ABI,
                functionName: 'activateService',
                args: [serviceId],
                chain: cronosTestnet,
                account,
            });

            console.log(`  ${serviceId.slice(0, 10)}... TX: ${hash.slice(0, 18)}...`);

            const receipt = await publicClient.waitForTransactionReceipt({ hash });
            console.log(`  ${receipt.status === 'success' ? '✅' : '❌'} Activation ${receipt.status}`);
        } catch (error) {
            console.log(`  ⚠ Activation failed (may need more cooldown): ${error}`);
        }
    }

    // Verify final states
    console.log('');
    console.log('════════════════════════════════════════════');
    console.log('▶ Final Service States');
    console.log('');

    const stateNames = ['Pending', 'Active', 'Challenged', 'Slashed', 'Withdrawn'];

    for (const serviceId of serviceIds) {
        const service = await publicClient.readContract({
            address: config.registryAddress,
            abi: REGISTRY_ABI,
            functionName: 'getService',
            args: [serviceId],
        });

        console.log(`  ${serviceId.slice(0, 18)}...`);
        console.log(`    State: ${stateNames[service.state]} (${service.state})`);
        console.log(`    Stake: ${Number(service.stake) / 1e18} CRO`);
        console.log('');
    }

    console.log('════════════════════════════════════════════');
    console.log(`🎯 Registered: ${serviceIds.length}/${testServices.length} services`);
    console.log('');
    console.log('Next steps:');
    console.log('  1. Indexer should pick up events automatically');
    console.log('  2. Check Gateway: curl http://localhost:3001/v1/discover');
    console.log('  3. Open Dashboard to verify visualization');
}

main().catch((error) => {
    console.error('Fatal error:', error);
    process.exit(1);
});
