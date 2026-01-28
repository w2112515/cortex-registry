'use client';

import { useState, useMemo } from 'react';
import NetworkGraph, { ServiceNode } from '@/components/NetworkGraph';
import Sidebar from '@/components/Sidebar';
import ServiceDetail from '@/components/ServiceDetail';
import ConnectWallet from '@/components/ConnectWallet';
import EconomicStats from '@/components/EconomicStats';
import ServiceList from '@/components/ServiceList';
import { useServices } from '@/hooks/useServices';
import AgentActivityPanel from '@/components/AgentActivityPanel';
import { Menu } from 'lucide-react';


export default function Home() {
  const { services, loading, error } = useServices();
  const [selectedNode, setSelectedNode] = useState<ServiceNode | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [activeFilters, setActiveFilters] = useState<Record<string, boolean>>({
    tools: true,
    resources: true,
    prompts: true,
  });
  const [sortField, setSortField] = useState('reputation');
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  // Filter services based on search query and capability filters
  const filteredServices = useMemo(() => {
    return services.filter(service => {
      // Search filter
      if (searchQuery) {
        const query = searchQuery.toLowerCase();
        const name = (service.name || '').toLowerCase();
        const provider = service.provider.toLowerCase();
        const type = (service.type || '').toLowerCase();
        if (!name.includes(query) && !provider.includes(query) && !type.includes(query)) {
          return false;
        }
      }

      // Capability filter
      const serviceType = service.type || 'tools';
      if (!activeFilters[serviceType]) {
        return false;
      }

      return true;
    });
  }, [services, searchQuery, activeFilters]);

  // Handlers
  const handleNodeSelect = (node: ServiceNode) => {
    setSelectedNode(node);
  };

  const handleSearch = (query: string) => {
    setSearchQuery(query);
  };

  const handleFilter = (id: string) => {
    setActiveFilters(prev => ({ ...prev, [id]: !prev[id] }));
  };

  const handleSort = (field: any) => {
    setSortField(field);
  };

  return (
    <main className="w-screen h-screen overflow-hidden flex bg-void-black">
      {/* 1. Left Sidebar */}
      <Sidebar
        services={filteredServices}
        onSearch={handleSearch}
        onFilter={handleFilter}
        onSort={handleSort}
        onSelect={(id) => console.log('Select', id)}
        mobileOpen={mobileMenuOpen}
        onMobileClose={() => setMobileMenuOpen(false)}
      />

      {/* 2. Main Canvas */}
      <div className="flex-1 relative md:ml-[280px] ml-0 flex flex-col h-full">
        {/* Header with Logo and Wallet */}
        <div className="absolute top-4 right-4 z-50 flex items-center gap-4">
          <span className="font-mono text-xs text-zinc-500 hidden sm:block">
            CORTEX.REGISTRY
          </span>
          <ConnectWallet services={services} onSelect={handleNodeSelect} />
        </div>

        {/* Mobile Hamburger Button */}
        <div className="absolute top-4 left-4 z-50 md:hidden">
          <button
            onClick={() => setMobileMenuOpen(true)}
            className="p-2 bg-black/40 backdrop-blur-md border border-white/10 rounded-lg text-white hover:bg-white/10 transition-colors"
          >
            <Menu className="w-6 h-6" />
          </button>
        </div>

        {/* Economic Stats Panel - Hidden on mobile if needed, or adjusted */}
        <div className="absolute top-4 left-4 right-[200px] z-40 hidden md:block">
          <EconomicStats className="max-w-4xl" />
        </div>

        {/* Background Effects */}
        <div className="scanlines" />
        <div className="vignette" />

        {/* Loading Overlay */}
        {loading && (
          <div className="absolute inset-0 flex items-center justify-center z-40 bg-void-black/50 pointer-events-none">
            <div className="text-neon-cyan font-mono text-lg animate-pulse">
              [LOADING_SERVICES...]
            </div>
          </div>
        )}

        {/* Error Banner */}
        {error && (
          <div className="absolute top-4 left-1/2 -translate-x-1/2 z-40 px-4 py-2 bg-red-500/20 border border-red-500/50 rounded text-red-400 font-mono text-sm">
            [ERROR] {error}
          </div>
        )}

        {/* Desktop View: Network Graph */}
        <div className="hidden md:block w-full h-full">
          <NetworkGraph
            className="w-full h-full"
            nodes={filteredServices}
            searchQuery={searchQuery}
            onNodeSelect={handleNodeSelect}
          />
        </div>

        {/* Mobile View: Service List */}
        <div className="md:hidden w-full h-full pt-20 px-4 pb-4">
          <ServiceList
            services={filteredServices}
            onSelect={handleNodeSelect}
            className="h-full"
          />
        </div>

        {/* Agent Activity Panel - Bottom Left Overlay (Task-49) */}
        <div className="absolute bottom-6 left-6 z-40 w-[420px] hidden md:block">
          <AgentActivityPanel />
        </div>
      </div>

      {/* 3. Right Detail Panel */}
      <ServiceDetail
        service={selectedNode}
        onClose={() => setSelectedNode(null)}
      />
    </main>
  );
}



