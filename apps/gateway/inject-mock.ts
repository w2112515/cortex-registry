/**
 * Inject Mock Services for Demo
 * 
 * This script injects the 5 [TESTNET] services into the Gateway's mock cache
 * so they appear in the Star Map without requiring real Redis or Indexer.
 */

import 'dotenv/config';
import { createClient } from 'redis';

const MOCK_SERVICES = [
    {
        id: '0x3c782f21e0c91eb5c7a9fb7d4b6fb2d53e713b67e3',
        provider: '0xb42a5fE98251f078F1A1D0Fca905765f71810876',
        stake: '1000000000000000000', // 1 CRO
        state: 0, // Pending
        metadataUri: 'data:application/json,%7B%22name%22%3A%22[TESTNET]%20Cortex%20Knowledge%20Base%22%7D',
        registeredAt: Math.floor(Date.now() / 1000) - 3600,
        challengeDeadline: 0,
        challenger: '0x0000000000000000000000000000000000000000',
        reputation: {
            totalCalls: 250,
            successCount: 240,
            displayScore: 78,
        },
        rank: 1,
        metadata: {
            name: '[TESTNET] Cortex Knowledge Base',
            description: 'AI-powered knowledge graph. DEMO ONLY.',
            version: '1.0.0',
            endpoint: 'https://httpbin.org/status/501',
            tools: [{ name: 'semantic_search', description: 'Search knowledge graph' }]
        }
    },
    {
        id: '0xb7a3325fd9d5da1dbb62b752763c06643adfc6a5d06b',
        provider: '0xb42a5fE98251f078F1A1D0Fca905765f71810876',
        stake: '1000000000000000000',
        state: 1, // Active
        metadataUri: 'data:application/json,%7B%22name%22%3A%22[TESTNET]%20Vision%20Analyzer%22%7D',
        registeredAt: Math.floor(Date.now() / 1000) - 7200,
        challengeDeadline: 0,
        challenger: '0x0000000000000000000000000000000000000000',
        reputation: {
            totalCalls: 180,
            successCount: 175,
            displayScore: 85,
        },
        rank: 2,
        metadata: {
            name: '[TESTNET] Vision Analyzer',
            description: 'Multi-modal image analysis. DEMO ONLY.',
            version: '1.0.0',
            endpoint: 'https://httpbin.org/status/501',
            tools: [{ name: 'analyze_image', description: 'Detect objects' }]
        }
    },
    {
        id: '0xcc49399a50274e7dcc49399a50274e7d',
        provider: '0xb42a5fE98251f078F1A1D0Fca905765f71810876',
        stake: '5000000000000000000', // 5 CRO
        state: 1,
        metadataUri: 'data:application/json,%7B%22name%22%3A%22[TESTNET]%20Code%20Synthesizer%22%7D',
        registeredAt: Math.floor(Date.now() / 1000) - 10800,
        challengeDeadline: 0,
        challenger: '0x0000000000000000000000000000000000000000',
        reputation: {
            totalCalls: 500,
            successCount: 495,
            displayScore: 92,
        },
        rank: 3,
        metadata: {
            name: '[TESTNET] Code Synthesizer',
            description: 'Advanced code generation. DEMO ONLY.',
            version: '1.0.0',
            endpoint: 'https://httpbin.org/status/501',
            tools: [{ name: 'generate_code', description: 'Generate code from spec' }]
        }
    },
    {
        id: '0x799e63e870e55767799e63e870e55767',
        provider: '0xb42a5fE98251f078F1A1D0Fca905765f71810876',
        stake: '2000000000000000000', // 2 CRO
        state: 1,
        metadataUri: 'data:application/json,%7B%22name%22%3A%22[TESTNET]%20Data%20Transformer%22%7D',
        registeredAt: Math.floor(Date.now() / 1000) - 14400,
        challengeDeadline: 0,
        challenger: '0x0000000000000000000000000000000000000000',
        reputation: {
            totalCalls: 320,
            successCount: 310,
            displayScore: 75,
        },
        rank: 4,
        metadata: {
            name: '[TESTNET] Data Transformer',
            description: 'Schema transformation. DEMO ONLY.',
            version: '1.0.0',
            endpoint: 'https://httpbin.org/status/501',
            tools: [{ name: 'transform_schema', description: 'Convert data formats' }]
        }
    },
    {
        id: '0x186417ef94c932fa186417ef94c932fa',
        provider: '0xb42a5fE98251f078F1A1D0Fca905765f71810876',
        stake: '10000000000000000000', // 10 CRO
        state: 3, // Slashed (for demo)
        metadataUri: 'data:application/json,%7B%22name%22%3A%22[TESTNET]%20Security%20Sentinel%22%7D',
        registeredAt: Math.floor(Date.now() / 1000) - 18000,
        challengeDeadline: 0,
        challenger: '0x0000000000000000000000000000000000000000',
        reputation: {
            totalCalls: 50,
            successCount: 30,
            displayScore: 35,
        },
        rank: 5,
        metadata: {
            name: '[TESTNET] Security Sentinel',
            description: 'Smart contract auditing. DEMO ONLY.',
            version: '1.0.0',
            endpoint: 'https://httpbin.org/status/501',
            tools: [{ name: 'audit_contract', description: 'Analyze vulnerabilities' }]
        }
    },
];

async function main() {
    console.log('╔════════════════════════════════════════════╗');
    console.log('║      Inject Mock Services for Demo         ║');
    console.log('╚════════════════════════════════════════════╝');

    const redisUrl = process.env.REDIS_URL || 'redis://localhost:6379';

    try {
        const client = createClient({ url: redisUrl });
        await client.connect();
        console.log('✅ Connected to Redis');

        // Inject service list
        await client.setEx('cortex:services:list:default', 300, JSON.stringify(MOCK_SERVICES));
        console.log(`✅ Injected ${MOCK_SERVICES.length} mock services`);

        await client.quit();
        console.log('🎯 Done! Refresh dashboard to see nodes.');
    } catch (err) {
        console.log('⚠️ Redis not available - printing mock data instead:');
        console.log(JSON.stringify(MOCK_SERVICES, null, 2));
        process.exit(0);
    }
}

main().catch(console.error);
