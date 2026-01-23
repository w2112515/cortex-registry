/**
 * x402 Payment Verifier
 * 
 * @description Verifies on-chain payment proofs for x402 protocol
 * @see Vol.3 §4 - x402 支付验证
 */

import { createPublicClient, http, type Address, type Hex, type PublicClient } from 'viem';
import { cronosTestnet } from 'viem/chains';

/**
 * Payment proof structure from x402 SDK
 */
export interface PaymentProof {
    txHash: Hex;
    sender: Address;
    amount: bigint;
    timestamp: number;
    signature?: Hex | undefined;
}

/**
 * Verification result with details
 */
export interface VerificationResult {
    isValid: boolean;
    error?: string | undefined;
    details?: {
        txConfirmed: boolean;
        amountSufficient: boolean;
        receiverMatches: boolean;
        notExpired: boolean;
        blockNumber?: bigint | undefined;
    } | undefined;
}

/**
 * Verification configuration
 */
interface VerifierConfig {
    rpcUrl: string;
    maxProofAge: number;
    minConfirmations: number;
}

const defaultConfig: VerifierConfig = {
    rpcUrl: process.env.CRONOS_RPC_URL || 'https://evm-t3.cronos.org',
    maxProofAge: 300,
    minConfirmations: 1,
};

let cachedClient: PublicClient | null = null;

function getClient(config: VerifierConfig = defaultConfig): PublicClient {
    if (!cachedClient) {
        cachedClient = createPublicClient({
            chain: cronosTestnet,
            transport: http(config.rpcUrl),
        });
    }
    return cachedClient;
}

/**
 * Verify an x402 payment proof
 */
export async function verifyX402Payment(
    proof: PaymentProof,
    expectedAmount: bigint,
    receiverAddress: Address,
    config: VerifierConfig = defaultConfig
): Promise<VerificationResult> {
    const client = getClient(config);

    const details: NonNullable<VerificationResult['details']> = {
        txConfirmed: false,
        amountSufficient: false,
        receiverMatches: false,
        notExpired: false,
        blockNumber: undefined,
    };

    try {
        // 1. Check proof timestamp
        const currentTime = Math.floor(Date.now() / 1000);
        if (currentTime - proof.timestamp > config.maxProofAge) {
            details.notExpired = false;
            return { isValid: false, error: 'Payment proof expired', details };
        }
        details.notExpired = true;

        // 2. Get transaction from chain
        const tx = await client.getTransaction({ hash: proof.txHash });
        if (!tx) {
            return { isValid: false, error: 'Transaction not found', details };
        }

        // 3. Verify receiver address
        if (tx.to?.toLowerCase() !== receiverAddress.toLowerCase()) {
            details.receiverMatches = false;
            return {
                isValid: false,
                error: `Receiver mismatch: expected ${receiverAddress}, got ${tx.to}`,
                details
            };
        }
        details.receiverMatches = true;

        // 4. Verify amount
        if (tx.value < expectedAmount) {
            details.amountSufficient = false;
            return {
                isValid: false,
                error: `Insufficient amount: expected ${expectedAmount}, got ${tx.value}`,
                details
            };
        }
        details.amountSufficient = true;

        // 5. Verify transaction is confirmed
        const receipt = await client.getTransactionReceipt({ hash: proof.txHash });
        if (!receipt || receipt.status !== 'success') {
            details.txConfirmed = false;
            return { isValid: false, error: 'Transaction not confirmed or failed', details };
        }
        details.txConfirmed = true;
        details.blockNumber = receipt.blockNumber;

        // 6. Check confirmations
        const latestBlock = await client.getBlockNumber();
        const confirmations = latestBlock - receipt.blockNumber;
        if (confirmations < BigInt(config.minConfirmations)) {
            return {
                isValid: false,
                error: `Insufficient confirmations: ${confirmations}/${config.minConfirmations}`,
                details
            };
        }

        // 7. Verify timestamp against block time
        const block = await client.getBlock({ blockNumber: receipt.blockNumber });
        const blockTime = Number(block.timestamp);

        if (Math.abs(blockTime - proof.timestamp) > 300) {
            return {
                isValid: false,
                error: 'Timestamp mismatch with block time',
                details
            };
        }

        return { isValid: true, details };

    } catch (error) {
        const message = error instanceof Error ? error.message : 'Unknown verification error';
        return { isValid: false, error: message, details };
    }
}

/**
 * Simple boolean verification
 */
export async function verifyPaymentSimple(
    proof: PaymentProof,
    expectedAmount: bigint,
    receiverAddress: Address
): Promise<boolean> {
    const result = await verifyX402Payment(proof, expectedAmount, receiverAddress);
    return result.isValid;
}
