/**
 * Withdraw Services Script
 * 
 * @description Withdraw staked funds from services on OLD contract
 */

import 'dotenv/config';
import {
    createPublicClient,
    createWalletClient,
    http,
    defineChain,
    parseAbiItem,
    type Address,
    type Hex,
} from 'viem';
import { privateKeyToAccount } from 'viem/accounts';

const cronosTestnet = defineChain({
    id: 338,
    name: 'Cronos Testnet',
    nativeCurrency: { name: 'TCRO', symbol: 'TCRO', decimals: 18 },
    rpcUrls: { default: { http: ['https://evm-t3.cronos.org'] } },
});

// OLD contract address where funds are staked
const OLD_REGISTRY = '0xffe6969bb8799eC86631D9D1bb9fcD9779Cd3FD2' as Address;

const WITHDRAW_ABI = [
    {
        type: 'function',
        name: 'withdrawService',
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
] as const;

async function main() {
    console.log('╔════════════════════════════════════════════╗');
    console.log('║   Withdraw Staked Funds from OLD Contract  ║');
    console.log('╚════════════════════════════════════════════╝');
    console.log('');

    const privateKey = process.env.DEPLOYER_PRIVATE_KEY as Hex;
    if (!privateKey) {
        console.error('❌ DEPLOYER_PRIVATE_KEY required');
        process.exit(1);
    }

    const account = privateKeyToAccount(privateKey);
    console.log(`Wallet: ${account.address}`);
    console.log(`OLD Contract: ${OLD_REGISTRY}`);
    console.log('');

    const publicClient = createPublicClient({
        chain: cronosTestnet,
        transport: http(),
    });

    const walletClient = createWalletClient({
        account,
        chain: cronosTestnet,
        transport: http(),
    });

    // Check balance before
    const balanceBefore = await publicClient.getBalance({ address: account.address });
    console.log(`Balance before: ${Number(balanceBefore) / 1e18} CRO`);
    console.log('');

    // Get all ServiceRegistered events from old contract
    // RPC has 2000 block limit, so batch query in 1500 block chunks
    console.log('▶ Scanning for registered services (from block 68320000)...');
    const currentBlock = await publicClient.getBlockNumber();
    const startBlock = BigInt(68320000); // From first transactions in CSV
    const batchSize = BigInt(1500);

    const allLogs: any[] = [];
    for (let from = startBlock; from < currentBlock; from += batchSize) {
        const to = from + batchSize > currentBlock ? currentBlock : from + batchSize;
        try {
            const batchLogs = await publicClient.getLogs({
                address: OLD_REGISTRY,
                event: parseAbiItem('event ServiceRegistered(bytes32 indexed serviceId, address indexed provider, uint256 stake)'),
                fromBlock: from,
                toBlock: to,
            });
            allLogs.push(...batchLogs);
            if (batchLogs.length > 0) {
                console.log(`  Found ${batchLogs.length} services in blocks ${from}-${to}`);
            }
        } catch (e) {
            // Skip failed batches
        }
    }
    const logs = allLogs;

    console.log(`Found ${logs.length} registered services`);
    console.log('');

    let totalWithdrawn = 0n;
    const stateNames = ['Pending', 'Active', 'Challenged', 'Slashed', 'Withdrawn'];

    for (const log of logs) {
        const serviceId = log.topics[1] as Hex;
        console.log(`━━━ Service: ${serviceId?.slice(0, 18)}... ━━━`);

        try {
            // Check service state
            const service = await publicClient.readContract({
                address: OLD_REGISTRY,
                abi: WITHDRAW_ABI,
                functionName: 'getService',
                args: [serviceId],
            });

            console.log(`  State: ${stateNames[service.state]} (${service.state})`);
            console.log(`  Stake: ${Number(service.stake) / 1e18} CRO`);

            // Only Active (1) services can be withdrawn
            if (service.state === 1) {
                console.log('  🔄 Attempting withdrawal...');

                const hash = await walletClient.writeContract({
                    address: OLD_REGISTRY,
                    abi: WITHDRAW_ABI,
                    functionName: 'withdrawService',
                    args: [serviceId],
                });

                console.log(`  TX: ${hash}`);
                const receipt = await publicClient.waitForTransactionReceipt({ hash });

                if (receipt.status === 'success') {
                    console.log('  ✅ Withdrawn successfully!');
                    totalWithdrawn += service.stake;
                } else {
                    console.log('  ❌ Withdrawal failed');
                }
            } else if (service.state === 4) {
                console.log('  ⏭️ Already withdrawn');
            } else {
                console.log(`  ⚠️ Cannot withdraw (state=${service.state})`);
            }
        } catch (error) {
            console.log(`  ❌ Error: ${error}`);
        }
        console.log('');
    }

    // Check balance after
    const balanceAfter = await publicClient.getBalance({ address: account.address });
    console.log('════════════════════════════════════════════');
    console.log(`Balance before: ${Number(balanceBefore) / 1e18} CRO`);
    console.log(`Balance after:  ${Number(balanceAfter) / 1e18} CRO`);
    console.log(`Recovered:      ${Number(balanceAfter - balanceBefore) / 1e18} CRO`);
}

main().catch(console.error);
