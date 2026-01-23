// CRITICAL: Load environment variables FIRST before any other imports
import './env.js';

import Fastify from 'fastify';
import cors from '@fastify/cors';
import helmet from '@fastify/helmet';
import rateLimit from '@fastify/rate-limit';
import x402Handler from './x402/handler.js';
import discoverRoutes from './routes/discover.js';
import agentRoutes from './routes/agent.js';
import { initRedis, closeRedis, isRedisConnected, getRedisClient } from './redis.js';
import { startIndexer, stopIndexer, getIndexerStatus } from './indexer.js';
import { initFailover, checkAllEndpointsHealth } from './rpc/failover.js';
import { executeWarmup, getWarmupMetrics } from './cache/warmup.js';

const fastify = Fastify({
  logger: true
});

// Middleware
fastify.register(cors);
fastify.register(helmet);

// Rate Limiter (Task-25: Vol.7 §2.3)
fastify.register(rateLimit, {
  max: 100,           // 100 requests per window
  timeWindow: '1 minute',
  errorResponseBuilder: (request, context) => ({
    statusCode: 429,
    error: 'Too Many Requests',
    message: `Rate limit exceeded. You have sent too many requests. Please wait ${context.after} before retrying.`,
    retryAfter: context.after,
  }),
  // Use Redis for distributed rate limiting when available
  redis: isRedisConnected() ? getRedisClient() : undefined,
});

// x402 Payment Handler
fastify.register(x402Handler);

// Discovery Routes (Task-20)
fastify.register(discoverRoutes);

// Agent Routes (Task-49)
fastify.register(agentRoutes);

// Health Check (Enhanced for Vol.6 §4.2 - Task-24)
fastify.get('/health', async (request, reply) => {
  const rpcHealth = await checkAllEndpointsHealth();
  const indexerStatus = getIndexerStatus();
  const warmupMetrics = getWarmupMetrics();

  const checks = {
    redis: {
      status: isRedisConnected() ? 'ok' : 'error',
    },
    rpc: {
      status: rpcHealth.healthy > 0 ? 'ok' : 'error',
      healthy: rpcHealth.healthy,
      unhealthy: rpcHealth.unhealthy,
    },
    indexer: {
      status: indexerStatus.isRunning ? 'ok' : 'stopped',
      lastBlock: indexerStatus.lastProcessedBlock,
      eventsProcessed: indexerStatus.processedEvents,
    },
    warmup: {
      status: warmupMetrics.completed ? 'ok' : 'pending',
      duration: warmupMetrics.duration,
      cached: warmupMetrics.cached,
    },
  };

  const allHealthy = checks.redis.status === 'ok' && checks.rpc.status === 'ok';

  // Get uptime and memory stats
  const memUsage = process.memoryUsage();

  return {
    status: allHealthy ? 'healthy' : 'degraded',
    version: '1.0.0',
    uptime: Math.floor(process.uptime()),
    memory: {
      heapUsed: Math.round(memUsage.heapUsed / 1024 / 1024),  // MB
      heapTotal: Math.round(memUsage.heapTotal / 1024 / 1024), // MB
      rss: Math.round(memUsage.rss / 1024 / 1024),            // MB
    },
    checks,
    timestamp: new Date().toISOString(),
  };
});

// Start server
const start = async () => {
  const startTime = Date.now();

  try {
    // Initialize RPC failover
    initFailover();
    console.log('✅ RPC Failover initialized');

    // Initialize Redis
    await initRedis();
    console.log('✅ Redis connected');

    // Execute cache warmup (Task-23)
    console.log('⏳ Executing cache warmup...');
    const warmupResult = await executeWarmup({ mode: 'full', timeout: 5000 });
    console.log(`✅ Warmup completed in ${warmupResult.duration}ms`);

    // Start Indexer
    await startIndexer();
    console.log('✅ Indexer started');

    // Start Fastify
    await fastify.listen({ port: 3001, host: '0.0.0.0' });

    const totalStartup = Date.now() - startTime;
    console.log(`🚀 Gateway listening on http://localhost:3001 (startup: ${totalStartup}ms)`);
  } catch (err) {
    fastify.log.error(err);
    process.exit(1);
  }
};

// Graceful shutdown
const shutdown = async (signal: string) => {
  console.log(`\n⚠️ ${signal} received, shutting down gracefully...`);

  try {
    stopIndexer();
    await closeRedis();
    await fastify.close();
    console.log('✅ Shutdown complete');
    process.exit(0);
  } catch (err) {
    console.error('❌ Shutdown error:', err);
    process.exit(1);
  }
};

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));

start();

