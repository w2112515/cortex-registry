/**
 * Query and Withdraw Services from OLD Contract
 * Uses transaction hashes from CSV to get serviceIds
 */

import 'dotenv/config';
import {
    createPublicClient,
    createWalletClient,
    http,
    defineChain,
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

const OLD_REGISTRY = '0xffe6969bb8799eC86631D9D1bb9fcD9779Cd3FD2' as Address;

// Transaction hashes from CSV for registerService calls to OLD contract
const TX_HASHES: Hex[] = [
    '0x6707c62fe8265227a8672be4e9b8ee1ba9f5f48bfe714c17606238bb390aae19',
    '0xeb9d02fdf85cc054a96d65714b243fd090499515a811f9b368bc01a393dd7796',
    '0x83ac76a52bbfde5d3cd901de534b7a487c0a5d25d4e79102ed7966ffa21b0922',
    '0xd38ffe78146c9eb7b01fcf216c543d5cb925fa870fbfe8a027cdb4617f485f04',
    '0x5491b5af86c3b1717f472ebeb94ee52397be744c587a4982b67e431e71a728c4',
    '0xf2ffd2684fa4e567e690b9c17fc01ca0a81d1e4681ea3e323123271ed1c79a83',
    '0xca4e5c4b3acdacbe519d950e5d942f4270cb2863c83b6cd2278b0e3c85e8e686',
    '0xf7cf1db62258684e150889b658cff1fcb597db5643f2832a72e3eccb255f64c5',
    '0x3c7a77f9f8f084b370d3955c7dfaa41ba12ad7ac096f4960d7fc281de74ce028',
    '0x98284c97372f4db7a2752f1167facc1689b9abf2874c9877494eb86a40be4f61',
    '0xce6748a4dfbe987eaed1cb3778aa8336bd727765e52479aea402def125c22d12',
    '0x76b3a036c5f44979aee618c5b6e0d30a5fda99056b94add95010a1c80ce1331a',
    '0x69c2c81ec2d5d4401d95b22a140bb6cf4192bce9649a5c8eb17801259853e6ad',
];

const ABI = [
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
    console.log('║  Query & Withdraw from OLD Contract        ║');
    console.log('╚════════════════════════════════════════════╝\n');

    const privateKey = process.env.DEPLOYER_PRIVATE_KEY as Hex;
    const account = privateKeyToAccount(privateKey);

    const publicClient = createPublicClient({
        chain: cronosTestnet,
        transport: http(),
    });

    const walletClient = createWalletClient({
        account,
        chain: cronosTestnet,
        transport: http(),
    });

    console.log(`Wallet: ${account.address}`);
    const balanceBefore = await publicClient.getBalance({ address: account.address });
    console.log(`Balance: ${Number(balanceBefore) / 1e18} CRO\n`);

    const stateNames = ['Pending', 'Active', 'Challenged', 'Slashed', 'Withdrawn'];
    let withdrawable = 0;
    let totalStake = 0n;

    // Get serviceIds from transaction receipts
    console.log('▶ Fetching serviceIds from transactions...\n');

    for (const txHash of TX_HASHES) {
        try {
            const receipt = await publicClient.getTransactionReceipt({ hash: txHash });
            const log = receipt.logs[0];
            if (!log || !log.topics[1]) continue;

            const serviceId = log.topics[1] as Hex;

            // Get service state
            const service = await publicClient.readContract({
                address: OLD_REGISTRY,
                abi: ABI,
                functionName: 'getService',
                args: [serviceId],
            });

            const stake = Number(service.stake) / 1e18;
            totalStake += service.stake;

            console.log(`${serviceId.slice(0, 18)}... | State: ${stateNames[service.state].padEnd(10)} | Stake: ${stake} CRO`);

            // Only Active (1) can be withdrawn normally
            if (service.state === 1) {
                withdrawable++;
                console.log(`  → Withdrawable!`);

                // Try withdraw
                try {
                    const hash = await walletClient.writeContract({
                        address: OLD_REGISTRY,
                        abi: ABI,
                        functionName: 'withdrawService',
                        args: [serviceId],
                    });
                    console.log(`  → TX: ${hash}`);
                    const r = await publicClient.waitForTransactionReceipt({ hash });
                    console.log(`  → ${r.status === 'success' ? '✅ Success!' : '❌ Failed'}`);
                } catch (e: any) {
                    console.log(`  → ❌ ${e.message?.slice(0, 50)}`);
                }
            }
        } catch (e: any) {
            console.log(`TX ${txHash.slice(0, 18)}... Error: ${e.message?.slice(0, 50)}`);
        }
    }

    const balanceAfter = await publicClient.getBalance({ address: account.address });
    console.log('\n════════════════════════════════════════════');
    console.log(`Total staked in OLD contract: ${Number(totalStake) / 1e18} CRO`);
    console.log(`Withdrawable services: ${withdrawable}`);
    console.log(`Balance before: ${Number(balanceBefore) / 1e18} CRO`);
    console.log(`Balance after:  ${Number(balanceAfter) / 1e18} CRO`);
    console.log(`Recovered:      ${Number(balanceAfter - balanceBefore) / 1e18} CRO`);
}

main().catch(console.error);
