/**
 * Register Test Service
 * 
 * @description Register a single test service for E2E testing
 * @see Task-49: Cortex Traveler AI Agent
 */

import 'dotenv/config';
import { createPublicClient, createWalletClient, http, parseEther, keccak256, toHex } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { cronosTestnet } from 'viem/chains';
import type { Address, Hex } from 'viem';

// ============ Configuration ============

const RPC_ENDPOINT = process.env.RPC_ENDPOINTS?.split(',')[0] || 'https://evm-t3.cronos.org';
const PRIVATE_KEY = process.env.DEPLOYER_PRIVATE_KEY as Hex;
const REGISTRY_ADDRESS = process.env.REGISTRY_ADDRESS as Address;

if (!PRIVATE_KEY) throw new Error('DEPLOYER_PRIVATE_KEY not set');
if (!REGISTRY_ADDRESS) throw new Error('REGISTRY_ADDRESS not set');

// ============ ABI ============

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
    name: 'MIN_STAKE',
    inputs: [],
    outputs: [{ name: '', type: 'uint256' }],
    stateMutability: 'view',
  },
] as const;

// ============ Main ============

async function main() {
  const account = privateKeyToAccount(PRIVATE_KEY);
  
  const publicClient = createPublicClient({
    chain: cronosTestnet,
    transport: http(RPC_ENDPOINT),
  });

  const walletClient = createWalletClient({
    account,
    chain: cronosTestnet,
    transport: http(RPC_ENDPOINT),
  });

  console.log('🚀 Registering test service...');
  console.log(`   Registry: ${REGISTRY_ADDRESS}`);
  console.log(`   Account: ${account.address}`);

  // Get MIN_STAKE
  const minStake = await publicClient.readContract({
    address: REGISTRY_ADDRESS,
    abi: REGISTRY_ABI,
    functionName: 'MIN_STAKE',
  });
  console.log(`   MIN_STAKE: ${minStake / BigInt(10**18)} CRO`);

  // Create unique metadata URI
  const timestamp = Date.now();
  const metadataUri = `ipfs://test-service-${timestamp}`;
  
  // Register with explicit gas parameters (Cronos EIP-1559 workaround)
  console.log('\n📝 Sending registerService transaction...');
  const txHash = await walletClient.writeContract({
    address: REGISTRY_ADDRESS,
    abi: REGISTRY_ABI,
    functionName: 'registerService',
    args: [metadataUri],
    value: minStake,
    gas: 500000n,
    maxFeePerGas: 5000000000000n,
    maxPriorityFeePerGas: 5000000000000n,
  });

  console.log(`   Tx: ${txHash}`);

  // Wait for confirmation
  const receipt = await publicClient.waitForTransactionReceipt({ hash: txHash });
  console.log(`   Status: ${receipt.status}`);
  console.log(`   Block: ${receipt.blockNumber}`);

  // Calculate service ID
  const serviceId = keccak256(toHex(metadataUri));
  console.log(`\n✅ Service registered!`);
  console.log(`   Service ID: ${serviceId}`);
  console.log(`   Metadata URI: ${metadataUri}`);
  console.log(`\n⏳ Wait 5 seconds for Indexer to sync...`);
  
  await new Promise(r => setTimeout(r, 5000));
  
  // Verify via Gateway
  console.log('\n🔍 Checking Gateway /v1/discover...');
  try {
    const response = await fetch('http://localhost:3001/v1/discover');
    const data = await response.json() as { services: any[]; total: number };
    console.log(`   Total services: ${data.total}`);
    
    if (data.services.length > 0) {
      console.log('   Services found:');
      for (const s of data.services) {
        console.log(`     - ${s.id?.slice(0, 18)}... | ${s.name || 'Unknown'}`);
      }
    } else {
      console.log('   ⚠️ No services in cache yet');
    }
  } catch (err: any) {
    console.log(`   ⚠️ Gateway check failed: ${err.message}`);
  }

  console.log('\n🎯 Next: Run Cortex Traveler agent');
  console.log('   pnpm exec tsx scripts/cortex-traveler.ts "I need weather data"');
}

main().catch(console.error);
