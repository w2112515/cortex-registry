/**
 * x402 Payment Helper Module
 * 
 * @description Blockchain payment utilities for Cortex Traveler
 * @see Task-49: Cortex Traveler AI Agent
 */

import 'dotenv/config';
import { createPublicClient, createWalletClient, http, formatEther, parseEther } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { cronosTestnet } from 'viem/chains';
import type { Address, Hex, Hash } from 'viem';

// ============ Configuration ============

const RPC_ENDPOINT = process.env.RPC_ENDPOINTS?.split(',')[0] || 'https://evm-t3.cronos.org';
const AGENT_PRIVATE_KEY = process.env.AGENT_PRIVATE_KEY as Hex | undefined;
const REGISTRY_ADDRESS = process.env.REGISTRY_ADDRESS as Address | undefined;

const CRONOS_EXPLORER = 'https://explorer.cronos.org/testnet/tx';

// ============ Error Classes ============

export class PaymentError extends Error {
  constructor(
    message: string,
    public code: string
  ) {
    super(message);
    this.name = 'PaymentError';
  }
}

// ============ Clients ============

function getClients() {
  if (!AGENT_PRIVATE_KEY) {
    throw new PaymentError('AGENT_PRIVATE_KEY not configured', 'INVALID_API_KEY');
  }

  const account = privateKeyToAccount(AGENT_PRIVATE_KEY);
  
  const publicClient = createPublicClient({
    chain: cronosTestnet,
    transport: http(RPC_ENDPOINT),
  });

  const walletClient = createWalletClient({
    account,
    chain: cronosTestnet,
    transport: http(RPC_ENDPOINT),
  });

  return { publicClient, walletClient, account };
}

// ============ Public Functions ============

/**
 * Check the agent wallet balance
 * 
 * @returns Balance in CRO (as number)
 * @throws PaymentError if balance is too low
 */
export async function checkBalance(): Promise<number> {
  const { publicClient, account } = getClients();
  
  const balance = await publicClient.getBalance({ address: account.address });
  const balanceCRO = parseFloat(formatEther(balance));

  if (balanceCRO < 1) {
    throw new PaymentError(
      `Insufficient balance: ${balanceCRO.toFixed(4)} CRO (minimum: 1 CRO)`,
      'INSUFFICIENT_BALANCE'
    );
  }

  if (balanceCRO < 5) {
    console.warn(`[Payment] Low balance warning: ${balanceCRO.toFixed(4)} CRO`);
  }

  return balanceCRO;
}

/**
 * Get the agent wallet address
 */
export function getAgentAddress(): Address {
  const { account } = getClients();
  return account.address;
}

/**
 * Pay for a service by sending CRO to the provider
 * 
 * @param providerAddress - Service provider's address
 * @param amountCRO - Amount to pay in CRO
 * @returns Transaction hash and explorer URL
 */
export async function payService(
  providerAddress: Address,
  amountCRO: number
): Promise<{ txHash: Hash; txExplorerUrl: string }> {
  const { publicClient, walletClient, account } = getClients();

  console.log(`[Payment] Sending ${amountCRO} CRO to ${providerAddress}...`);

  // Prepare transaction with explicit gas parameters (Cronos EIP-1559 workaround)
  const txHash = await walletClient.sendTransaction({
    to: providerAddress,
    value: parseEther(amountCRO.toString()),
    gas: 21000n,
    maxFeePerGas: 5000000000000n,
    maxPriorityFeePerGas: 5000000000000n,
  });

  console.log(`[Payment] Transaction sent: ${txHash}`);

  // Wait for confirmation
  const receipt = await publicClient.waitForTransactionReceipt({ hash: txHash });
  
  if (receipt.status !== 'success') {
    throw new PaymentError(`Transaction failed: ${txHash}`, 'TX_FAILED');
  }

  const txExplorerUrl = `${CRONOS_EXPLORER}/${txHash}`;
  console.log(`[Payment] Confirmed: ${txExplorerUrl}`);

  return { txHash, txExplorerUrl };
}

/**
 * Get service price from contract (mock for now - services define their own pricing)
 * 
 * @param serviceId - Service ID (bytes32 hex string)
 * @returns Price in CRO
 */
export async function getServicePrice(serviceId: string): Promise<number> {
  // For demo purposes, use a fixed small price
  // Real implementation would query the service's x402 metadata
  return 0.01; // 0.01 CRO per call
}

/**
 * Format transaction hash for display
 */
export function formatTxHash(hash: string): string {
  if (hash.length <= 16) return hash;
  return `${hash.slice(0, 10)}...${hash.slice(-6)}`;
}

/**
 * Get explorer URL for a transaction
 */
export function getExplorerUrl(txHash: string): string {
  return `${CRONOS_EXPLORER}/${txHash}`;
}
