/**
 * DeepSeek API Client
 * 
 * @description AI decision-making client for Cortex Traveler
 * @see Task-49: Cortex Traveler AI Agent
 */

import 'dotenv/config';

// ============ Types ============

export interface DeepSeekDecision {
  selected: string;
  reason: string;
}

export interface ServiceInfo {
  id: string;
  name: string;
  description: string;
  price: string;
  reputation: number;
}

// ============ Configuration ============

const DEEPSEEK_API_KEY = process.env.DEEPSEEK_API_KEY;
const DEEPSEEK_BASE_URL = process.env.DEEPSEEK_BASE_URL || 'https://api.deepseek.com/v1';
const DEEPSEEK_MODEL = process.env.DEEPSEEK_MODEL || 'deepseek-chat';

const MAX_RETRIES = 3;
const RETRY_DELAYS = [1000, 2000, 4000]; // Exponential backoff

// ============ Error Classes ============

export class DeepSeekError extends Error {
  constructor(
    message: string,
    public code: string,
    public retryable: boolean = false
  ) {
    super(message);
    this.name = 'DeepSeekError';
  }
}

// ============ Main Function ============

/**
 * Ask DeepSeek to select the best service for a given goal
 * 
 * @param goal - User's goal/intent
 * @param services - Available services to choose from
 * @returns Decision with selected service ID and reasoning
 */
export async function askDeepSeek(
  goal: string,
  services: ServiceInfo[]
): Promise<DeepSeekDecision> {
  if (!DEEPSEEK_API_KEY) {
    throw new DeepSeekError(
      'DEEPSEEK_API_KEY not configured',
      'INVALID_API_KEY',
      false
    );
  }

  if (services.length === 0) {
    throw new DeepSeekError(
      'No services available to choose from',
      'NO_SERVICES',
      false
    );
  }

  const prompt = buildPrompt(goal, services);
  
  let lastError: Error | null = null;
  
  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    try {
      const response = await callDeepSeekAPI(prompt);
      const decision = parseResponse(response, services);
      return decision;
    } catch (err: any) {
      lastError = err;
      
      // Don't retry non-retryable errors
      if (err instanceof DeepSeekError && !err.retryable) {
        throw err;
      }
      
      // Wait before retry (exponential backoff)
      if (attempt < MAX_RETRIES - 1) {
        const delay = RETRY_DELAYS[attempt] || 4000;
        console.log(`[DeepSeek] Retry ${attempt + 1}/${MAX_RETRIES} in ${delay}ms...`);
        await sleep(delay);
      }
    }
  }
  
  throw new DeepSeekError(
    `Failed after ${MAX_RETRIES} attempts: ${lastError?.message}`,
    'MAX_RETRIES_EXCEEDED',
    false
  );
}

// ============ Helper Functions ============

function buildPrompt(goal: string, services: ServiceInfo[]): string {
  const serviceList = services.map((s, i) => 
    `${i + 1}. ID: "${s.id}" | Name: "${s.name}" | Price: ${s.price} CRO | Reputation: ${s.reputation}/100\n   Description: ${s.description}`
  ).join('\n');

  return `You are an AI agent selecting the best MCP service for a user's goal.

USER GOAL: "${goal}"

AVAILABLE SERVICES:
${serviceList}

INSTRUCTIONS:
1. Analyze the user's goal
2. Match it to the most suitable service based on name, description, and capabilities
3. Consider reputation (higher is better) and price (lower is better for same quality)
4. Return your decision in EXACT JSON format

RESPONSE FORMAT (JSON only, no markdown):
{"selected": "<service_id>", "reason": "<one sentence explanation>"}

Your response:`;
}

async function callDeepSeekAPI(prompt: string): Promise<string> {
  const response = await fetch(`${DEEPSEEK_BASE_URL}/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${DEEPSEEK_API_KEY}`,
    },
    body: JSON.stringify({
      model: DEEPSEEK_MODEL,
      messages: [
        { role: 'user', content: prompt }
      ],
      temperature: 0.3,
      max_tokens: 200,
    }),
  });

  if (!response.ok) {
    const status = response.status;
    const text = await response.text().catch(() => 'Unknown error');
    
    if (status === 401 || status === 403) {
      throw new DeepSeekError(`API authentication failed: ${text}`, 'INVALID_API_KEY', false);
    }
    if (status === 429) {
      throw new DeepSeekError('Rate limit exceeded', 'RATE_LIMIT', true);
    }
    if (status >= 500) {
      throw new DeepSeekError(`Server error: ${status}`, 'SERVER_ERROR', true);
    }
    
    throw new DeepSeekError(`API error ${status}: ${text}`, 'API_ERROR', false);
  }

  const data = await response.json();
  
  if (!data.choices?.[0]?.message?.content) {
    throw new DeepSeekError('Empty response from API', 'EMPTY_RESPONSE', true);
  }

  return data.choices[0].message.content;
}

function parseResponse(response: string, services: ServiceInfo[]): DeepSeekDecision {
  // Clean response - remove markdown code blocks if present
  let cleaned = response.trim();
  if (cleaned.startsWith('```')) {
    cleaned = cleaned.replace(/^```(?:json)?\n?/, '').replace(/\n?```$/, '');
  }
  
  try {
    const parsed = JSON.parse(cleaned);
    
    if (!parsed.selected || !parsed.reason) {
      throw new Error('Missing required fields');
    }
    
    // Validate selected service exists
    const validIds = services.map(s => s.id);
    if (!validIds.includes(parsed.selected)) {
      // Try to find closest match
      const match = services.find(s => 
        s.id.includes(parsed.selected) || parsed.selected.includes(s.id)
      );
      if (match) {
        parsed.selected = match.id;
      } else {
        // Fallback to first service
        console.warn(`[DeepSeek] Invalid service ID "${parsed.selected}", using first service`);
        parsed.selected = services[0].id;
        parsed.reason = `Fallback selection: ${parsed.reason}`;
      }
    }
    
    return {
      selected: parsed.selected,
      reason: parsed.reason,
    };
  } catch (err) {
    throw new DeepSeekError(
      `Failed to parse response: ${cleaned.substring(0, 100)}...`,
      'PARSE_ERROR',
      false
    );
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}
