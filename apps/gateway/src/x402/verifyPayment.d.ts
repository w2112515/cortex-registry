/**
 * x402 Payment Verifier
 *
 * @description Verifies on-chain payment proofs for x402 protocol
 * @see Vol.3 §4 - x402 支付验证
 */
import { type Address, type Hex } from 'viem';
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
/**
 * Verify an x402 payment proof
 */
export declare function verifyX402Payment(proof: PaymentProof, expectedAmount: bigint, receiverAddress: Address, config?: VerifierConfig): Promise<VerificationResult>;
/**
 * Simple boolean verification
 */
export declare function verifyPaymentSimple(proof: PaymentProof, expectedAmount: bigint, receiverAddress: Address): Promise<boolean>;
export {};
//# sourceMappingURL=verifyPayment.d.ts.map