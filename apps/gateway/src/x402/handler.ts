import type { FastifyInstance, FastifyPluginAsync } from 'fastify';

/**
 * x402 Payment Response Schema
 * Returned when payment is required for API access
 */
interface X402PaymentRequired {
    /** HTTP status code */
    status: 402;
    /** Error message */
    error: 'Payment Required';
    /** Payment details */
    payment: {
        /** Amount required in wei */
        amount: string;
        /** Payment token address (0x0 for native CRO) */
        token: string;
        /** Payment receiver address */
        receiver: string;
        /** Chain ID */
        chainId: number;
        /** Request ID for tracking */
        requestId: string;
        /** Expiration timestamp */
        expiresAt: number;
    };
    /** MCP-specific metadata */
    mcp: {
        /** Protocol version */
        version: string;
        /** Supported capabilities */
        capabilities: string[];
    };
}

/**
 * x402 Handler Plugin
 * Implements 402 Payment Required response for /v1/discover endpoint
 */
const x402Handler: FastifyPluginAsync = async (fastify: FastifyInstance) => {
    // Configuration (from environment or defaults)
    const config = {
        receiverAddress: process.env.PAYMENT_RECEIVER || '0x0000000000000000000000000000000000000000',
        chainId: parseInt(process.env.CHAIN_ID || '338'), // Cronos testnet
        pricePerRequest: process.env.PRICE_PER_REQUEST || '100000000000000000', // 0.1 CRO
        requestTtlSeconds: 300, // 5 minutes
    };

    // NOTE: /v1/discover is now handled by routes/discover.ts (Task-20)
    // x402 payment verification is integrated there via x-payment-proof header

    /**
     * GET /v1/discover/preview
     * Returns service preview without payment (limited info)
     */
    fastify.get('/v1/discover/preview', async (request, reply) => {
        return reply.send({
            totalServices: 0,
            topCategories: [],
            message: 'Register your service at cortexregistry.io',
        });
    });
};

export default x402Handler;
