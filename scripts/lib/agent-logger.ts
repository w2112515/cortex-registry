/**
 * Agent Logger Module
 * 
 * @description Redis-based logging for Cortex Traveler agent runs
 * @see Task-49: Cortex Traveler AI Agent
 */

import 'dotenv/config';
import { createClient, RedisClientType } from 'redis';
import { randomUUID } from 'crypto';

// ============ Types ============

export interface AgentRun {
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

export type AgentRunInput = Omit<AgentRun, 'id' | 'timestamp'>;

// ============ Configuration ============

const REDIS_HOST = process.env.REDIS_HOST || 'localhost';
const REDIS_PORT = parseInt(process.env.REDIS_PORT || '6379');
const REDIS_PASSWORD = process.env.REDIS_PASSWORD || undefined;
const REDIS_DB = parseInt(process.env.REDIS_DB || '0');

const REDIS_KEY = 'cortex:agent:runs';
const MAX_RUNS = 50;

// ============ Redis Client ============

let redisClient: RedisClientType | null = null;

async function getRedisClient(): Promise<RedisClientType> {
  if (redisClient && redisClient.isOpen) {
    return redisClient;
  }

  const url = REDIS_PASSWORD 
    ? `redis://:${REDIS_PASSWORD}@${REDIS_HOST}:${REDIS_PORT}/${REDIS_DB}`
    : `redis://${REDIS_HOST}:${REDIS_PORT}/${REDIS_DB}`;

  redisClient = createClient({ url });

  redisClient.on('error', (err) => {
    console.error('[AgentLogger] Redis error:', err.message);
  });

  await redisClient.connect();
  console.log('[AgentLogger] Redis connected');

  return redisClient;
}

// ============ Public Functions ============

/**
 * Log an agent run to Redis
 * 
 * @param run - Agent run data (without id and timestamp)
 * @returns The generated run ID
 */
export async function logAgentRun(run: AgentRunInput): Promise<string> {
  const client = await getRedisClient();
  
  const fullRun: AgentRun = {
    id: randomUUID(),
    timestamp: Date.now(),
    ...run,
  };

  // LPUSH to add at the beginning (newest first)
  await client.lPush(REDIS_KEY, JSON.stringify(fullRun));
  
  // LTRIM to keep only the latest MAX_RUNS entries
  await client.lTrim(REDIS_KEY, 0, MAX_RUNS - 1);

  console.log(`[AgentLogger] Logged run ${fullRun.id} (${fullRun.status})`);
  
  return fullRun.id;
}

/**
 * Get recent agent runs from Redis
 * 
 * @param limit - Maximum number of runs to retrieve (default: 50)
 * @returns Array of agent runs, newest first
 */
export async function getAgentRuns(limit: number = MAX_RUNS): Promise<AgentRun[]> {
  const client = await getRedisClient();
  
  const rawRuns = await client.lRange(REDIS_KEY, 0, limit - 1);
  
  return rawRuns.map(raw => {
    try {
      return JSON.parse(raw) as AgentRun;
    } catch {
      return null;
    }
  }).filter((run): run is AgentRun => run !== null);
}

/**
 * Close the Redis connection
 * Call this when the script exits
 */
export async function closeAgentLogger(): Promise<void> {
  if (redisClient && redisClient.isOpen) {
    await redisClient.quit();
    redisClient = null;
    console.log('[AgentLogger] Redis disconnected');
  }
}

/**
 * Clear all agent runs (for testing)
 */
export async function clearAgentRuns(): Promise<void> {
  const client = await getRedisClient();
  await client.del(REDIS_KEY);
  console.log('[AgentLogger] Cleared all runs');
}
