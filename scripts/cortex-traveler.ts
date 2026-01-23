#!/usr/bin/env tsx
/**
 * Cortex Traveler - Autonomous AI Agent
 * 
 * @description Self-sovereign AI agent that discovers, pays for, and consumes MCP services
 * @see Task-49: Cortex Traveler AI Agent
 * 
 * Usage:
 *   pnpm exec tsx scripts/cortex-traveler.ts "I need weather data"
 *   pnpm exec tsx scripts/cortex-traveler.ts --loop
 */

import 'dotenv/config';
import chalk from 'chalk';
import { askDeepSeek, ServiceInfo, DeepSeekError } from './lib/deepseek.js';
import { logAgentRun, closeAgentLogger, AgentRunInput } from './lib/agent-logger.js';
import { checkBalance, payService, getAgentAddress, getServicePrice, formatTxHash } from './lib/payment.js';
import type { Address } from 'viem';

// ============ Configuration ============

const GATEWAY_URL = process.env.GATEWAY_URL || 'http://localhost:3001';

const DEFAULT_GOALS = [
  'I need current weather information for major cities',
  'I want to generate a random number for my application',
  'I need to translate text from English to Chinese',
  'I want to analyze sentiment of customer reviews',
  'I need real-time cryptocurrency price data',
];

// Fatal errors that should stop the agent immediately
const FATAL_ERRORS = ['INVALID_API_KEY', 'INSUFFICIENT_BALANCE'];

// ============ Types ============

interface DiscoveredService {
  id: string;
  name: string;
  provider: Address;
  stake: string;
  state: string;
  reputation: number;
  metadataUri: string;
  type?: string;
  description?: string;
  endpoint?: string;
}

// ============ Main Agent Logic ============

async function discoverServices(): Promise<DiscoveredService[]> {
  console.log(chalk.cyan('📡 Discovering services...'));

  const response = await fetch(`${GATEWAY_URL}/v1/discover`);

  if (!response.ok) {
    throw new Error(`Discovery failed: ${response.status} ${response.statusText}`);
  }

  const data = await response.json() as { services?: DiscoveredService[] };

  if (!Array.isArray(data.services)) {
    throw new Error('Discovery failed: Gateway response missing services list');
  }

  const services = data.services;

  console.log(chalk.green(`   Found ${services.length} services`));

  return services;
}

function mapToServiceInfo(services: DiscoveredService[]): ServiceInfo[] {
  return services.map((s, index) => {
    // Generate readable name from service ID if not available
    const shortId = s.id.slice(2, 10).toUpperCase();
    const defaultName = `Cortex-${shortId}`;

    // Use metadata if available, otherwise generate descriptive fallbacks
    const name = s.name || (s.metadataUri ? extractNameFromUri(s.metadataUri) : null) || defaultName;

    // 🔥 ENHANCEMENT: Infer MCP capabilities based on name for smarter AI decisions
    let capabilities = '';
    let description = '';
    const nameLower = name.toLowerCase();

    if (nameLower.includes('weather') || nameLower.includes('meteorolog')) {
      capabilities = 'Tools: [get_current_weather, get_forecast_7d, get_air_quality]';
      description = 'Real-time meteorological data provider with global coverage.';
    } else if (nameLower.includes('vision') || nameLower.includes('image') || nameLower.includes('visual')) {
      capabilities = 'Tools: [analyze_image, detect_objects, ocr_text_extraction]';
      description = 'Computer vision pipeline for image understanding and analysis.';
    } else if (nameLower.includes('code') || nameLower.includes('synthesizer') || nameLower.includes('developer')) {
      capabilities = 'Tools: [generate_code, refactor_snippet, explain_code]';
      description = 'Specialized LLM for software engineering tasks.';
    } else if (nameLower.includes('knowledge') || nameLower.includes('search') || nameLower.includes('semantic')) {
      capabilities = 'Tools: [semantic_search, query_graph, retrieve_context]';
      description = 'RAG-enhanced knowledge base query engine.';
    } else if (nameLower.includes('security') || nameLower.includes('audit') || nameLower.includes('sentinel')) {
      capabilities = 'Tools: [scan_contract, check_vulnerabilities, verify_ownership]';
      description = 'Smart contract security analysis and auditing suite.';
    } else if (nameLower.includes('data') || nameLower.includes('transform') || nameLower.includes('etl')) {
      capabilities = 'Tools: [convert_json_to_csv, normalize_schema, validate_format]';
      description = 'Data transformation and ETL pipeline utilities.';
    } else if (nameLower.includes('translate') || nameLower.includes('language') || nameLower.includes('nlp')) {
      capabilities = 'Tools: [translate_text, detect_language, sentiment_analysis]';
      description = 'Multilingual NLP services for text processing.';
    } else if (nameLower.includes('crypto') || nameLower.includes('price') || nameLower.includes('market')) {
      capabilities = 'Tools: [get_token_price, get_market_cap, track_portfolio]';
      description = 'Cryptocurrency market data and portfolio tracking.';
    } else {
      capabilities = 'Tools: [basic_mcp_tool, health_check]';
      description = `General purpose MCP service (#${index + 1}).`;
    }

    // Add deterministic variance to reputation based on ID to avoid "all identical" reasoning
    const charCode = s.id.charCodeAt(s.id.length - 1) + s.id.charCodeAt(s.id.length - 2);
    const variance = (charCode % 30) - 10; // Range: -10 to +19
    const enhancedReputation = Math.min(98, Math.max(42, (s.reputation || 50) + variance));

    return {
      id: s.id,
      name,
      description: `${description} | ${capabilities}`,
      price: '0.01',
      reputation: enhancedReputation,
    };
  });
}

/**
 * Extract service name from metadata URI if it's a data URI with JSON
 */
function extractNameFromUri(uri: string): string | null {
  if (uri.startsWith('data:application/json,')) {
    try {
      const jsonStr = decodeURIComponent(uri.replace('data:application/json,', ''));
      const data = JSON.parse(jsonStr);
      return data.name || null;
    } catch {
      return null;
    }
  }
  return null;
}

/**
 * Format stake amount for display
 */
function formatStake(stake: string): string {
  const wei = BigInt(stake || '0');
  const cro = Number(wei) / 1e18;
  return cro > 0 ? `${cro.toFixed(0)} CRO` : 'Unknown';
}

async function runAgent(goal: string): Promise<void> {
  const startTime = Date.now();

  console.log(chalk.magenta.bold('\n🤖 CORTEX TRAVELER'));
  console.log(chalk.dim('━'.repeat(50)));
  console.log(chalk.white(`Goal: "${goal}"`));
  console.log(chalk.dim(`Agent: ${getAgentAddress()}`));
  console.log(chalk.dim('━'.repeat(50)));

  // Step 0: Pre-check balance
  console.log(chalk.cyan('\n💰 Checking balance...'));
  const balance = await checkBalance();
  console.log(chalk.green(`   Balance: ${balance.toFixed(4)} CRO`));

  // Step 1: Discover services
  const services = await discoverServices();

  if (services.length === 0) {
    console.log(chalk.yellow('⚠️  No services available. Skipping this run.'));
    return;
  }

  // Step 2: Ask DeepSeek to decide
  console.log(chalk.cyan('\n🧠 Consulting DeepSeek AI...'));
  const serviceInfos = mapToServiceInfo(services);
  const decision = await askDeepSeek(goal, serviceInfos);

  const selectedService = services.find(s => s.id === decision.selected);
  if (!selectedService) {
    throw new Error(`Selected service not found: ${decision.selected}`);
  }

  console.log(chalk.green(`   Selected: ${selectedService.name || selectedService.id}`));
  console.log(chalk.dim(`   Reason: ${decision.reason}`));

  // Step 3: Pay for service
  console.log(chalk.cyan('\n💳 Processing payment...'));
  const price = await getServicePrice(selectedService.id);
  const { txHash, txExplorerUrl } = await payService(selectedService.provider, price);

  console.log(chalk.green(`   Tx: ${formatTxHash(txHash)}`));
  console.log(chalk.dim(`   Explorer: ${txExplorerUrl}`));

  // Step 4: Consume service (simulated for demo)
  console.log(chalk.cyan('\n📥 Consuming service...'));
  const result = {
    service: selectedService.name,
    response: `[Simulated response from ${selectedService.name}]`,
    timestamp: new Date().toISOString(),
  };
  console.log(chalk.green(`   Result: ${JSON.stringify(result).slice(0, 60)}...`));

  // Step 5: Log to Redis
  console.log(chalk.cyan('\n💾 Logging run...'));
  const runData: AgentRunInput = {
    goal,
    selectedService: selectedService.id,
    serviceName: selectedService.name || selectedService.id,
    reason: decision.reason,
    txHash,
    txExplorerUrl,
    result,
    status: 'success',
  };

  const runId = await logAgentRun(runData);

  const duration = ((Date.now() - startTime) / 1000).toFixed(2);

  console.log(chalk.dim('━'.repeat(50)));
  console.log(chalk.green.bold(`✅ Run completed in ${duration}s`));
  console.log(chalk.dim(`   Run ID: ${runId}`));
  console.log(chalk.dim(`   Tx: ${txExplorerUrl}`));
}

async function runAgentSafe(goal: string): Promise<boolean> {
  try {
    await runAgent(goal);
    return true;
  } catch (err: any) {
    const code = err.code || 'UNKNOWN';

    if (FATAL_ERRORS.includes(code)) {
      console.error(chalk.red.bold(`\n❌ FATAL ERROR: ${err.message}`));
      console.error(chalk.red(`   Code: ${code}`));
      return false; // Signal to stop
    }

    console.error(chalk.yellow(`\n⚠️  Transient Error: ${err.message}`));

    // Log failed run
    try {
      await logAgentRun({
        goal,
        selectedService: '',
        serviceName: '',
        reason: err.message,
        txHash: '',
        txExplorerUrl: '',
        result: { error: err.message },
        status: 'failed',
      });
    } catch {
      // Ignore logging errors
    }

    return true; // Continue running
  }
}

// ============ CLI Entry Point ============

async function main() {
  const args = process.argv.slice(2);

  const loopMode = args.includes('--loop');
  const goal = args.filter(a => !a.startsWith('--')).join(' ') || DEFAULT_GOALS[0];

  console.log(chalk.blue.bold('\n╔════════════════════════════════════════════════════╗'));
  console.log(chalk.blue.bold('║         CORTEX TRAVELER - AI AGENT                 ║'));
  console.log(chalk.blue.bold('╚════════════════════════════════════════════════════╝'));
  console.log(chalk.dim(`Mode: ${loopMode ? 'Autonomous Loop' : 'Single Run'}`));
  console.log(chalk.dim(`Gateway: ${GATEWAY_URL}`));

  if (loopMode) {
    console.log(chalk.magenta.bold('\n🔄 AUTONOMOUS LOOP ACTIVATED'));
    console.log(chalk.dim('Press Ctrl+C to stop agent\n'));

    // Graceful shutdown handler
    process.on('SIGINT', async () => {
      console.log(chalk.yellow('\n\n⚠️  Shutting down...'));
      await closeAgentLogger();
      process.exit(0);
    });

    // Serial loop execution
    while (true) {
      const randomGoal = DEFAULT_GOALS[Math.floor(Math.random() * DEFAULT_GOALS.length)];
      const shouldContinue = await runAgentSafe(randomGoal);

      if (!shouldContinue) {
        console.error(chalk.red.bold('\n🛑 Agent stopped due to fatal error'));
        await closeAgentLogger();
        process.exit(1);
      }

      // Random wait 15-30s between runs
      const waitTime = 15000 + Math.random() * 15000;
      console.log(chalk.dim(`\n⏳ Waiting ${Math.floor(waitTime / 1000)}s before next run...`));
      await new Promise(r => setTimeout(r, waitTime));
    }
  } else {
    // Single run mode
    const success = await runAgentSafe(goal);
    await closeAgentLogger();
    process.exit(success ? 0 : 1);
  }
}

main().catch(async (err) => {
  console.error(chalk.red.bold('\n❌ Unexpected Error:'), err);
  await closeAgentLogger();
  process.exit(1);
});
