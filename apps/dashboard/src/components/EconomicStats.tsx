'use client';

import React from 'react';
import { useEconomicStats, formatCRO } from '@/hooks/useEconomicStats';
import KpiCard from './KpiCard';

interface EconomicStatsProps {
    className?: string;
}

const EconomicStats: React.FC<EconomicStatsProps> = ({ className = '' }) => {
    const { stats, loading, error } = useEconomicStats();

    if (loading) {
        return (
            <div className={`grid grid-cols-4 gap-3 ${className}`}>
                {[...Array(4)].map((_, i) => (
                    <div key={i} className="h-20 bg-zinc-900/50 rounded-lg animate-pulse" />
                ))}
            </div>
        );
    }

    if (error) {
        return (
            <div className={`text-red-400 text-xs font-mono ${className}`}>
                [STATS_ERROR] {error}
            </div>
        );
    }

    return (
        <div className={`grid grid-cols-4 gap-3 ${className}`}>
            <KpiCard
                title="Total Value Locked"
                value={`${formatCRO(stats.tvl)} CRO`}
                trend="stable"
                color="gold"
            />
            <KpiCard
                title="Active Services"
                value={stats.activeServices}
                trend={stats.activeServices > 0 ? 'up' : 'stable'}
                color="cyan"
            />
            <KpiCard
                title="24h Volume"
                value={`${formatCRO(stats.totalVolume)} CRO`}
                trend="stable"
                color="magenta"
            />
            <KpiCard
                title="Avg Reputation"
                value={`${(stats.avgReputation / 1e18).toFixed(1)}%`}
                trend="stable"
                color="violet"
            />
        </div>
    );
};

export default EconomicStats;
