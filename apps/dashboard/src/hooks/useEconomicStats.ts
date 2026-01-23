'use client';

import { useState, useEffect } from 'react';

const GATEWAY_URL = process.env.NEXT_PUBLIC_GATEWAY_URL || 'http://localhost:3001';

export interface EconomicStats {
  tvl: bigint;              // Total Value Locked (sum of all stakes)
  activeServices: number;   // Count of active services
  totalVolume: bigint;      // Total payment volume (24h)
  avgReputation: number;    // Average reputation score
}

export function useEconomicStats() {
  const [stats, setStats] = useState<EconomicStats>({
    tvl: BigInt(0),
    activeServices: 0,
    totalVolume: BigInt(0),
    avgReputation: 0,
  });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchStats = async () => {
      try {
        // Fetch services from discover endpoint
        const res = await fetch(`${GATEWAY_URL}/v1/discover`);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = await res.json();

        const services = data.services || [];
        
        // Calculate statistics from services
        let totalStake = BigInt(0);
        let totalReputation = 0;
        let activeCount = 0;

        for (const service of services) {
          // Parse stake (could be string or number)
          const stake = BigInt(service.stake || '0');
          totalStake += stake;
          
          // Count active services (state === 1)
          if (service.state === 1 || service.state === 'Active') {
            activeCount++;
          }

          // Sum reputation for average
          totalReputation += Number(service.reputation || 0);
        }

        const avgRep = services.length > 0 
          ? totalReputation / services.length 
          : 0;

        // Volume is simulated as we don't have real payment tracking yet
        // In production, this would come from a separate endpoint
        const simulatedVolume = BigInt(activeCount) * BigInt('100000000000000000000'); // 100 CRO per active service

        setStats({
          tvl: totalStake,
          activeServices: activeCount,
          totalVolume: simulatedVolume,
          avgReputation: avgRep,
        });
        setError(null);
      } catch (err) {
        console.error('Failed to fetch economic stats:', err);
        setError(err instanceof Error ? err.message : 'Unknown error');
      } finally {
        setLoading(false);
      }
    };

    fetchStats();
    // Refresh every 15 seconds
    const interval = setInterval(fetchStats, 15000);
    return () => clearInterval(interval);
  }, []);

  return { stats, loading, error };
}

// Utility function to format CRO amount (18 decimals)
export function formatCRO(amount: bigint): string {
  const value = Number(amount) / 1e18;
  if (value >= 1_000_000) {
    return `${(value / 1_000_000).toFixed(2)}M`;
  }
  if (value >= 1_000) {
    return `${(value / 1_000).toFixed(2)}K`;
  }
  return value.toFixed(2);
}
