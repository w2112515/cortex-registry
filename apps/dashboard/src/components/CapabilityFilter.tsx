import React from 'react';

interface CapabilityFilterProps {
    filters: { [key: string]: boolean };
    onFilterChange: (id: string) => void;
}

const CAPABILITIES = [
    { id: 'tools', label: 'TOOLS' },
    { id: 'resources', label: 'RESOURCES' },
    { id: 'prompts', label: 'PROMPTS' },
];

const CapabilityFilter: React.FC<CapabilityFilterProps> = ({ filters, onFilterChange }) => {
    return (
        <div className="space-y-3 mb-6">
            <h3 className="text-xs font-mono text-gray-500 uppercase tracking-widest pl-1">Protocol Filters</h3>
            <div className="space-y-2">
                {CAPABILITIES.map((cap) => (
                    <button
                        key={cap.id}
                        onClick={() => onFilterChange(cap.id)}
                        className={`w-full flex items-center justify-between px-3 py-2 text-sm font-mono border transition-all duration-200 group ${filters[cap.id]
                                ? 'border-neon-cyan bg-neon-cyan/10 text-neon-cyan'
                                : 'border-grid-line text-gray-400 hover:border-gray-500'
                            }`}
                    >
                        <span className="tracking-wider flex items-center">
                            <span className={`w-1.5 h-1.5 mr-2 rounded-full ${filters[cap.id] ? 'bg-neon-cyan shadow-[0_0_8px_#00f3ff]' : 'bg-gray-600'}`} />
                            {cap.label}
                        </span>
                        <span className="opacity-50 text-xs">
                            {filters[cap.id] ? '[ACTIVE]' : '[OFF]'}
                        </span>
                    </button>
                ))}
            </div>
        </div>
    );
};

export default CapabilityFilter;
