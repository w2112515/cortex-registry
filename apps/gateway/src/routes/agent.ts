/**
 * Agent API Routes
 * 
 * @description API endpoints for Cortex Traveler agent activity
 * @see Task-49: Cortex Traveler AI Agent
 */

import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { getRedis } from '../redis.js';

// ============ Types ============

interface AgentRun {
  id: string;
  timestamp: number;
  goal: string;
  selectedService: string;
  serviceName: string;
  reason: string;
  txHash: string;
  txExplorerUrl: string;
  result: unknown;
  status: 'success' | 'failed';
}

// ============ Constants ============

const REDIS_KEY = 'agent:runs'; // Note: Gateway uses 'cortex:' prefix automatically
const DEFAULT_LIMIT = 50;

// ============ Routes ============

export default async function agentRoutes(app: FastifyInstance): Promise<void> {
  /**
   * GET /v1/agent/runs
   * 
   * Retrieve recent agent activity logs
   * 
   * @query limit - Maximum number of runs to return (default: 50)
   */
  app.get('/v1/agent/runs', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const redis = getRedis();
      const query = request.query as { limit?: string };
      const limit = Math.min(parseInt(query.limit || '50'), DEFAULT_LIMIT);

      // Read from Redis list
      const rawRuns = await redis.lrange('agent:runs', 0, limit - 1);
      
      const runs: AgentRun[] = rawRuns
        .map((raw: string) => {
          try {
            return JSON.parse(raw) as AgentRun;
          } catch {
            return null;
          }
        })
        .filter((run): run is AgentRun => run !== null);

      return {
        runs,
        count: runs.length,
        timestamp: Date.now(),
      };
    } catch (err) {
      request.log.error(err, 'Failed to fetch agent runs');
      
      // Return empty array to prevent frontend crashes
      return {
        runs: [],
        count: 0,
        timestamp: Date.now(),
        error: 'Failed to fetch agent activity',
      };
    }
  });

  /**
   * GET /v1/agent/stats
   * 
   * Get aggregate statistics about agent activity
   */
  app.get('/v1/agent/stats', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const redis = getRedis();
      
      // Get all runs for stats calculation
      const rawRuns = await redis.lrange('agent:runs', 0, DEFAULT_LIMIT - 1);
      
      const runs: AgentRun[] = rawRuns
        .map((raw: string) => {
          try {
            return JSON.parse(raw) as AgentRun;
          } catch {
            return null;
          }
        })
        .filter((run): run is AgentRun => run !== null);

      const successCount = runs.filter(r => r.status === 'success').length;
      const failedCount = runs.filter(r => r.status === 'failed').length;
      
      // Calculate unique services used
      const uniqueServices = new Set(runs.map(r => r.selectedService).filter(Boolean));
      
      // Get latest run timestamp
      const latestRun = runs[0]?.timestamp || null;

      return {
        totalRuns: runs.length,
        successCount,
        failedCount,
        successRate: runs.length > 0 ? (successCount / runs.length * 100).toFixed(1) : '0',
        uniqueServices: uniqueServices.size,
        latestRun,
        timestamp: Date.now(),
      };
    } catch (err) {
      request.log.error(err, 'Failed to fetch agent stats');
      
      return {
        totalRuns: 0,
        successCount: 0,
        failedCount: 0,
        successRate: '0',
        uniqueServices: 0,
        latestRun: null,
        timestamp: Date.now(),
      };
    }
  });
}
