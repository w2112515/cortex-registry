import React, { useMemo } from 'react';
import type { ServiceNode } from './NetworkGraph';

interface LeaderboardProps {
    services: ServiceNode[];
    onSort: (field: 'stake' | 'reputation' | 'calls') => void;
}

const Leaderboard: React.FC<LeaderboardProps> = ({ services, onSort }) => {
    const leaders = useMemo(() => {
        return [...services]
            .filter(s => s.reputation?.bayesianScore != null)
            .sort((a, b) => (b.reputation?.bayesianScore || 0) - (a.reputation?.bayesianScore || 0))
            .slice(0, 5)
            .map((s, i) => ({
                rank: i + 1,
                name: s.name || (s.metadata as { name?: string })?.name || 'Unknown',
                score: ((s.reputation?.bayesianScore || 0) / 1e18 * 100).toFixed(1),
            }));
    }, [services]);

    return (
        <div className="mt-8">
            <div className="flex items-center justify-between mb-4 px-1">
                <h3 className="text-xs font-mono text-gray-500 uppercase tracking-widest">Top Nodes</h3>
                <div className="flex space-x-2">
                    {['REP', 'STK', 'OPS'].map((sort) => (
                        <button
                            key={sort}
                            onClick={() => onSort(sort === 'REP' ? 'reputation' : sort === 'STK' ? 'stake' : 'calls')}
                            className="text-[10px] font-mono text-gray-600 hover:text-neon-cyan transition-colors"
                        >
                            {sort}
                        </button>
                    ))}
                </div>
            </div>

            <div className="space-y-1">
                {leaders.length === 0 ? (
                    <div className="text-center text-gray-600 font-mono text-xs py-4">
                        [NO_SERVICES_FOUND]
                    </div>
                ) : (
                    leaders.map((node) => (
                        <div
                            key={node.name}
                            className="group flex items-center justify-between px-3 py-2 rounded bg-white/5 hover:bg-white/10 border border-transparent hover:border-gray-700 transition-all cursor-pointer"
                        >
                            <div className="flex items-center space-x-3">
                                <span className={`font-mono text-xs ${node.rank === 1 ? 'text-stellar-gold' :
                                    node.rank === 2 ? 'text-gray-300' :
                                        node.rank === 3 ? 'text-orange-400' : 'text-gray-600'
                                    }`}>#{node.rank}</span>
                                <span className="font-display text-sm tracking-wide text-gray-200 group-hover:text-white group-hover:text-glow-cyan transition-all">
                                    {node.name}
                                </span>
                            </div>

                            <div className="text-right">
                                <div className="font-mono text-xs text-neon-cyan">{node.score}%</div>
                            </div>
                        </div>
                    ))
                )}
            </div>
        </div>
    );
};

export default Leaderboard;

