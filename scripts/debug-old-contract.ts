/**
 * Debug script to check OLD contract status
 */
import 'dotenv/config';
import { createPublicClient, http, defineChain, getAddress, type Hex } from 'viem';

const cronosTestnet = defineChain({
    id: 338,
    name: 'Cronos Testnet',
    nativeCurrency: { name: 'TCRO', symbol: 'TCRO', decimals: 18 },
    rpcUrls: { default: { http: ['https://evm-t3.cronos.org'] } },
});

const OLD_REGISTRY = getAddress('0xffe6969bb8799eC86631D9D1bb9fcD9779Cd3FD2');

const ABI = [
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
        name: 'serviceCount',
        inputs: [],
        outputs: [{ name: '', type: 'uint256' }],
        stateMutability: 'view',
    },
] as const;

// First TX from CSV
const FIRST_TX: Hex = '0x69c2c81ec2d5d4401d95b22a140bb6cf4192bce9649a5c8eb17801259853e6ad';

async function main() {
    console.log('=== Debug OLD Contract ===\n');

    const publicClient = createPublicClient({
        chain: cronosTestnet,
        transport: http(),
    });

    // 1. Check contract exists
    const code = await publicClient.getCode({ address: OLD_REGISTRY });
    console.log('Contract code length:', code?.length || 0);

    // 2. Check contract balance (should hold staked CRO)
    const balance = await publicClient.getBalance({ address: OLD_REGISTRY });
    console.log('Contract balance:', Number(balance) / 1e18, 'CRO');

    // 3. Try to get service count
    try {
        const count = await publicClient.readContract({
            address: OLD_REGISTRY,
            abi: ABI,
            functionName: 'serviceCount',
        });
        console.log('Service count:', Number(count));
    } catch (e: any) {
        console.log('serviceCount() failed:', e.shortMessage || e.message?.slice(0, 100));
    }

    // 4. Get first TX receipt and try to query service
    console.log('\n--- First TX Analysis ---');
    try {
        const receipt = await publicClient.getTransactionReceipt({ hash: FIRST_TX });
        console.log('TX status:', receipt.status);
        console.log('TX to:', receipt.to);
        console.log('Logs count:', receipt.logs.length);
        
        if (receipt.logs.length > 0) {
            const log = receipt.logs[0];
            console.log('Log address:', log.address);
            console.log('Log topics:', log.topics);
            
            if (log.topics[1]) {
                const serviceId = log.topics[1] as Hex;
                console.log('\nServiceId:', serviceId);
                
                // Query service
                try {
                    const service = await publicClient.readContract({
                        address: OLD_REGISTRY,
                        abi: ABI,
                        functionName: 'getService',
                        args: [serviceId],
                    });
                    console.log('Service found!');
                    console.log('  Provider:', service.provider);
                    console.log('  Stake:', Number(service.stake) / 1e18, 'CRO');
                    console.log('  State:', ['Pending', 'Active', 'Challenged', 'Slashed', 'Withdrawn'][service.state]);
                } catch (e: any) {
                    console.log('getService() failed:', e.shortMessage || e.message?.slice(0, 200));
                }
            }
        }
    } catch (e: any) {
        console.log('TX receipt failed:', e.message?.slice(0, 100));
    }
}

// 5. Try to activate the service
async function tryActivate() {
    console.log('\n--- Try Activate Service ---');
    
    const privateKey = process.env.DEPLOYER_PRIVATE_KEY as Hex;
    if (!privateKey) {
        console.log('No DEPLOYER_PRIVATE_KEY');
        return;
    }
    
    const { privateKeyToAccount } = await import('viem/accounts');
    const { createWalletClient } = await import('viem');
    
    const account = privateKeyToAccount(privateKey);
    console.log('Wallet:', account.address);
    
    const walletClient = createWalletClient({
        account,
        chain: cronosTestnet,
        transport: http(),
    });
    
    const publicClient = createPublicClient({
        chain: cronosTestnet,
        transport: http(),
    });
    
    // Get first service ID
    const receipt = await publicClient.getTransactionReceipt({ hash: FIRST_TX });
    const serviceId = receipt.logs[0].topics[1] as Hex;
    
    // Check current time vs cooldown
    const service = await publicClient.readContract({
        address: OLD_REGISTRY,
        abi: ABI,
        functionName: 'getService',
        args: [serviceId],
    });
    
    const now = Math.floor(Date.now() / 1000);
    const registeredAt = Number(service.registeredAt);
    const cooldownEnd = registeredAt + 3600; // 1 hour
    console.log('Now:', now);
    console.log('Registered at:', registeredAt);
    console.log('Cooldown ends:', cooldownEnd);
    console.log('Cooldown passed:', now > cooldownEnd, `(${Math.floor((now - cooldownEnd) / 3600)}h ago)`);
    
    // Try to simulate the call first
    console.log('\nSimulating activateService...');
    try {
        await publicClient.simulateContract({
            address: OLD_REGISTRY,
            abi: [{
                type: 'function',
                name: 'activateService',
                inputs: [{ name: 'serviceId', type: 'bytes32' }],
                outputs: [],
                stateMutability: 'nonpayable',
            }],
            functionName: 'activateService',
            args: [serviceId],
            account: account.address,
        });
        console.log('Simulation PASSED! Executing...');
        
        // Actually execute with explicit gas settings (Cronos EIP-1559 workaround)
        const hash = await walletClient.writeContract({
            address: OLD_REGISTRY,
            abi: [{
                type: 'function',
                name: 'activateService',
                inputs: [{ name: 'serviceId', type: 'bytes32' }],
                outputs: [],
                stateMutability: 'nonpayable',
            }],
            functionName: 'activateService',
            args: [serviceId],
            gas: 500000n,
            maxFeePerGas: 5000000000000n,      // 5000 gwei
            maxPriorityFeePerGas: 5000000000000n,
        });
        console.log('TX sent:', hash);
        
        const txReceipt = await publicClient.waitForTransactionReceipt({ hash });
        console.log('TX status:', txReceipt.status);
        
        if (txReceipt.status === 'success') {
            console.log('✅ Service activated! Now withdrawing...');
            
            // Withdraw with explicit gas
            const hash2 = await walletClient.writeContract({
                address: OLD_REGISTRY,
                abi: [{
                    type: 'function',
                    name: 'withdrawStake',
                    inputs: [{ name: 'serviceId', type: 'bytes32' }],
                    outputs: [],
                    stateMutability: 'nonpayable',
                }],
                functionName: 'withdrawStake',
                args: [serviceId],
                gas: 500000n,
                maxFeePerGas: 5000000000000n,
                maxPriorityFeePerGas: 5000000000000n,
            });
            console.log('Withdraw TX:', hash2);
            
            const r2 = await publicClient.waitForTransactionReceipt({ hash: hash2 });
            console.log('Withdraw status:', r2.status);
            
            if (r2.status === 'success') {
                const newBalance = await publicClient.getBalance({ address: account.address });
                console.log('✅ Stake withdrawn! New balance:', Number(newBalance) / 1e18, 'CRO');
            }
        }
    } catch (e: any) {
        console.log('FAILED!');
        console.log('Error:', e.shortMessage || e.message);
        if (e.cause) {
            console.log('Cause:', JSON.stringify(e.cause, null, 2).slice(0, 800));
        }
    }
}

main().then(tryActivate).catch(console.error);
