'use client';

import { useState, useEffect } from 'react';
import type { ServiceNode } from '@/components/NetworkGraph';

// Use relative path to leverage Next.js rewrites proxy (works in both local and proxy environments)
const GATEWAY_URL = process.env.NEXT_PUBLIC_GATEWAY_URL || '/api/gateway';

export function useServices() {
  const [services, setServices] = useState<ServiceNode[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchServices = async () => {
      try {
        const res = await fetch(`${GATEWAY_URL}/v1/discover`);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = await res.json();

        // Transform API data to ServiceNode format
        const nodes: ServiceNode[] = (data.services || []).map((s: any, i: number) => ({
          id: s.id,
          provider: s.provider,
          stake: s.stake,
          state: s.state,
          reputation: s.reputation,
          metadata: s.metadata,
          name: s.metadata?.name || `Service-${i}`,
          type: s.metadata?.capability || 'tools',
        }));

        setServices(nodes);
        setError(null);
      } catch (err) {
        console.error('Failed to fetch services:', err);
        setError(err instanceof Error ? err.message : 'Unknown error');
        // Keep existing services on error to avoid UI flash
      } finally {
        setLoading(false);
      }
    };

    fetchServices();
    // Refresh every 30s
    const interval = setInterval(fetchServices, 30000);
    return () => clearInterval(interval);
  }, []);

  return { services, loading, error };
}
