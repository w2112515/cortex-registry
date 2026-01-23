import React, { useState } from 'react';
import Link from 'next/link';
import SearchBar from './SearchBar';
import CapabilityFilter from './CapabilityFilter';
import Leaderboard from './Leaderboard';
import KpiCard from './KpiCard';
import type { ServiceNode } from './NetworkGraph';

interface SidebarProps {
    services: ServiceNode[];
    onSearch: (query: string) => void;
    onFilter: (id: string) => void;
    onSort: (field: string) => void;
    onSelect: (id: string) => void;
}

const Sidebar: React.FC<SidebarProps> = ({ services, onSearch, onFilter, onSort, onSelect }) => {
    const [filters, setFilters] = useState({
        tools: true,
        resources: true,
        prompts: true,
    });

    const handleFilter = (id: string) => {
        // @ts-ignore
        setFilters(prev => ({ ...prev, [id]: !prev[id] }));
        onFilter(id);
    };

    return (
        <div className="fixed left-0 top-0 bottom-0 w-[280px] bg-[#050505]/90 border-r border-grid-line z-40 flex flex-col backdrop-blur-xl">
            {/* Brand Header */}
            <div className="p-6 border-b border-grid-line">
                <h1 className="font-display text-2xl font-bold text-white tracking-wider flex items-center">
                    <span className="text-neon-cyan mr-2">✦</span>
                    CORTEX
                </h1>
                <div className="text-[10px] font-mono text-gray-500 tracking-[0.2em] mt-1 pl-6">REGISTRY V1.0</div>
            </div>

            {/* Navigation */}
            <div className="p-4 border-b border-grid-line/50">
                <nav className="flex flex-col gap-1">
                    <Link href="/" className="flex items-center gap-3 px-3 py-2 rounded-md hover:bg-white/5 transition-colors group">
                        <div className="w-4 h-4 rounded-full border border-neon-cyan/50 group-hover:border-neon-cyan group-hover:shadow-[0_0_8px_rgba(0,212,255,0.5)] transition-all flex items-center justify-center">
                            <div className="w-1 h-1 bg-neon-cyan rounded-full" />
                        </div>
                        <span className="font-mono text-xs text-gray-300 group-hover:text-white tracking-wider">STAR MAP</span>
                    </Link>
                    <Link href="/workflow" className="flex items-center gap-3 px-3 py-2 rounded-md hover:bg-white/5 transition-colors group">
                        <div className="w-4 h-4 rounded border border-gray-600 group-hover:border-neon-purple group-hover:shadow-[0_0_8px_rgba(176,38,255,0.5)] transition-all flex items-center justify-center">
                            <div className="w-1 h-1 bg-gray-500 group-hover:bg-neon-purple rounded-sm" />
                        </div>
                        <span className="font-mono text-xs text-gray-300 group-hover:text-white tracking-wider">WORKFLOW</span>
                    </Link>
                </nav>
            </div>

            {/* Scrollable Content */}
            <div className="flex-1 overflow-y-auto p-4 custom-scrollbar">
                <SearchBar onSearch={onSearch} />

                {/* KPIs Grid */}
                <div className="grid grid-cols-2 gap-2 mb-6">
                    <KpiCard title="Active" value="124" color="cyan" />
                    <KpiCard title="TVL" value="$4.2M" color="gold" trend="up" />
                </div>

                <CapabilityFilter filters={filters} onFilterChange={handleFilter} />

                <Leaderboard services={services} onSort={onSort} />
            </div>

            {/* Footer Status */}
            <div className="p-4 border-t border-grid-line bg-black/20">
                <div className="flex items-center justify-between text-[10px] font-mono text-gray-600">
                    <div className="flex items-center">
                        <div className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse mr-2" />
                        SYSTEM_ONLINE
                    </div>
                    <div>42ms</div>
                </div>
            </div>
        </div>
    );
};

export default Sidebar;
