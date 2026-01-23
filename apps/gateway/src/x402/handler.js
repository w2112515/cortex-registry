/**
 * x402 Handler Plugin
 * Implements 402 Payment Required response for /v1/discover endpoint
 */
const x402Handler = async (fastify) => {
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
//# sourceMappingURL=handler.js.map