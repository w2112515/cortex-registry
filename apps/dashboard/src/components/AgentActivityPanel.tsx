'use client';

/**
 * AgentActivityPanel Component
 * 
 * @description Real-time display of Cortex Traveler agent activity
 * @see Task-49: Cortex Traveler AI Agent
 */

import { useState, useEffect } from 'react';

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

interface AgentRunsResponse {
  runs: AgentRun[];
  count: number;
  timestamp: number;
}

// ============ Constants ============

const GATEWAY_URL = process.env.NEXT_PUBLIC_GATEWAY_URL || 'http://localhost:3001';
const POLL_INTERVAL = 5000; // 5 seconds

// ============ Component ============

export function AgentActivityPanel() {
  const [runs, setRuns] = useState<AgentRun[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isExpanded, setIsExpanded] = useState(true);
  const [expandedReasonId, setExpandedReasonId] = useState<string | null>(null);

  useEffect(() => {
    const fetchRuns = async () => {
      try {
        const response = await fetch(`${GATEWAY_URL}/v1/agent/runs?limit=10`);
        if (!response.ok) throw new Error('Failed to fetch');

        const data: AgentRunsResponse = await response.json();
        setRuns(data.runs || []);
        setError(null);
      } catch (err) {
        setError('Unable to connect');
      } finally {
        setIsLoading(false);
      }
    };

    fetchRuns();
    const interval = setInterval(fetchRuns, POLL_INTERVAL);

    return () => clearInterval(interval);
  }, []);

  const formatTime = (timestamp: number) => {
    const date = new Date(timestamp);
    return date.toLocaleTimeString('en-US', {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: false
    });
  };

  const formatTxHash = (hash: string) => {
    if (!hash || hash.length < 16) return hash || '—';
    return `${hash.slice(0, 8)}...${hash.slice(-4)}`;
  };

  return (
    <div className="glass-panel rounded-lg overflow-hidden border border-zinc-800/50 bg-black/80 backdrop-blur-sm">
      {/* Header */}
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        className="w-full px-4 py-3 flex items-center justify-between border-b border-zinc-800/50 hover:bg-zinc-900/50 transition-colors"
      >
        <div className="flex items-center gap-2">
          <span className="text-lg">🤖</span>
          <span className="font-mono text-sm font-medium text-zinc-300">
            CORTEX TRAVELER
          </span>
          <span className={`w-2 h-2 rounded-full animate-pulse ${runs.length > 0 ? 'bg-green-500' : 'bg-zinc-600'
            }`} />
        </div>
        <div className="flex items-center gap-2">
          <span className="font-mono text-xs text-zinc-500">
            {runs.length} runs
          </span>
          <span className={`text-zinc-400 transition-transform ${isExpanded ? 'rotate-180' : ''}`}>
            ▼
          </span>
        </div>
      </button>

      {/* Content */}
      {isExpanded && (
        <div className="max-h-[300px] overflow-y-auto">
          {isLoading ? (
            <div className="px-4 py-8 text-center">
              <span className="font-mono text-xs text-zinc-500 animate-pulse">
                [CONNECTING...]
              </span>
            </div>
          ) : error ? (
            <div className="px-4 py-8 text-center">
              <span className="font-mono text-xs text-red-400">
                [ERROR] {error}
              </span>
            </div>
          ) : runs.length === 0 ? (
            <div className="px-4 py-8 text-center">
              <span className="font-mono text-xs text-zinc-500">
                [NO_ACTIVITY]
              </span>
              <p className="mt-2 text-xs text-zinc-600">
                Start the agent: <code className="text-zinc-400">pnpm exec tsx scripts/cortex-traveler.ts --loop</code>
              </p>
            </div>
          ) : (
            <div className="divide-y divide-zinc-800/50">
              {runs.map((run) => (
                <div
                  key={run.id}
                  className="px-4 py-3 hover:bg-zinc-900/30 transition-colors"
                >
                  {/* Time and Status */}
                  <div className="flex items-center justify-between mb-1">
                    <span className="font-mono text-xs text-zinc-500">
                      {formatTime(run.timestamp)}
                    </span>
                    <span className={`font-mono text-xs ${run.status === 'success' ? 'text-green-400' : 'text-red-400'
                      }`}>
                      {run.status === 'success' ? '✓ SUCCESS' : '✗ FAILED'}
                    </span>
                  </div>

                  {/* Goal */}
                  <div className="flex items-start gap-2 mb-2">
                    <span className="text-xs mt-0.5" title="Agent Goal">🎯</span>
                    <p className="text-sm text-zinc-300 line-clamp-2 leading-tight">
                      {run.goal}
                    </p>
                  </div>

                  {/* Service and Tx */}
                  <div className="flex items-center justify-between text-xs pl-6 mb-1">
                    <div className="flex items-center gap-1.5 text-cyan-400 font-mono">
                      <span>🤖</span>
                      <span>
                        {run.serviceName?.length > 20 && run.serviceName.startsWith('0x')
                          ? `Cortex-${run.serviceName.slice(2, 6).toUpperCase()}...${run.serviceName.slice(-4).toUpperCase()}`
                          : (run.serviceName || 'Unknown')}
                      </span>
                    </div>
                    {run.txHash && (
                      <a
                        href={run.txExplorerUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex items-center gap-1 text-zinc-500 hover:text-cyan-400 font-mono transition-colors"
                        title="View Transaction"
                      >
                        <span>🔗</span>
                        {formatTxHash(run.txHash)}
                      </a>
                    )}
                  </div>

                  {/* Reason */}
                  <div className="pl-6 border-l-2 border-zinc-800 ml-1.5 mt-2">
                    <p
                      className={`pl-2 text-xs text-zinc-500 italic cursor-pointer hover:text-zinc-400 transition-colors ${expandedReasonId === run.id ? '' : 'line-clamp-2'
                        }`}
                      onClick={() => setExpandedReasonId(expandedReasonId === run.id ? null : run.id)}
                      title="Click to expand/collapse"
                    >
                      {run.reason}
                    </p>
                    {run.reason && run.reason.length > 80 && expandedReasonId !== run.id && (
                      <span
                        className="pl-2 text-cyan-400/70 text-xs cursor-pointer hover:text-cyan-400"
                        onClick={() => setExpandedReasonId(run.id)}
                      >
                        ▸ 展开详情
                      </span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Footer */}
      {isExpanded && runs.length > 0 && (
        <div className="px-4 py-2 border-t border-zinc-800/50 bg-zinc-900/30">
          <span className="font-mono text-xs text-zinc-600">
            Auto-refresh: {POLL_INTERVAL / 1000}s
          </span>
        </div>
      )}
    </div>
  );
}

export default AgentActivityPanel;
