import React from 'react';
import type { ServiceNode } from './NetworkGraph';

interface ServiceDetailProps {
    service: ServiceNode | null;
    onClose: () => void;
}

const ServiceDetail: React.FC<ServiceDetailProps> = ({ service, onClose }) => {
    if (!service) return null;

    return (
        <div className="absolute right-0 top-0 bottom-0 w-80 bg-[#050505]/95 border-l border-grid-line backdrop-blur-md transform transition-transform duration-300 translate-x-0 z-50 flex flex-col">
            {/* Header */}
            <div className="p-6 border-b border-grid-line relative overflow-hidden">
                <div className="absolute top-0 right-0 p-2">
                    <button
                        onClick={onClose}
                        className="text-gray-500 hover:text-neon-cyan transition-colors"
                    >
                        <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M6 18L18 6M6 6l12 12" />
                        </svg>
                    </button>
                </div>

                <div className="mb-1 text-xs font-mono text-neon-cyan tracking-widest">[NODE_DETAILS]</div>
                <h2 className="text-2xl font-display font-bold text-white mb-2 text-glow-cyan">{service.name}</h2>
                <div className="flex items-center space-x-2">
                    <span className={`px-2 py-0.5 text-[10px] font-mono border rounded ${service.state === 1 ? 'border-green-500/50 text-green-400 bg-green-500/10' : 'border-red-500/50 text-red-400 bg-red-500/10'
                        }`}>
                        {service.state === 1 ? 'ACTIVE' : 'CHALLENGED'}
                    </span>
                    <span className="px-2 py-0.5 text-[10px] font-mono border border-neon-iolet/50 text-neon-violet bg-neon-violet/10">
                        {service.type}
                    </span>
                </div>
            </div>

            {/* Content */}
            <div className="flex-1 overflow-y-auto p-6 space-y-6">
                {/* Reputation */}
                <div>
                    <div className="flex justify-between text-xs font-mono text-gray-400 mb-2">
                        <span>REPUTATION_SCORE</span>
                        <span className="text-neon-cyan">{service.reputation?.bayesianScore ?? 0}%</span>
                    </div>
                    <div className="h-2 bg-gray-800 rounded-full overflow-hidden">
                        <div
                            className="h-full bg-gradient-to-r from-neon-blue to-neon-cyan"
                            style={{ width: `${service.reputation?.bayesianScore ?? 0}%` }}
                        />
                    </div>
                </div>

                {/* Stats Grid */}
                <div className="grid grid-cols-2 gap-4">
                    <div className="p-3 bg-white/5 rounded border border-white/10">
                        <div className="text-[10px] font-mono text-gray-400 mb-1">TOTAL_STAKE</div>
                        <div className="text-xl font-display text-stellar-gold">{(Number(BigInt(service.stake || '0') / BigInt(10 ** 18))).toLocaleString()} CRO</div>
                    </div>
                    <div className="p-3 bg-white/5 rounded border border-white/10">
                        <div className="text-[10px] font-mono text-gray-400 mb-1">TOTAL_CALLS</div>
                        <div className="text-xl font-display text-white">{(service.reputation?.totalCalls ?? 0).toLocaleString()}</div>
                    </div>
                    <div className="p-3 bg-white/5 rounded border border-white/10 col-span-2">
                        <div className="text-[10px] font-mono text-gray-400 mb-1">OPERATOR</div>
                        <div className="text-sm font-mono text-gray-300 truncate" title={service.provider}>
                            {service.provider}</div>
                    </div>
                </div>

                {/* Capabilities */}
                <div>
                    <div className="text-xs font-mono text-gray-500 uppercase tracking-widest mb-3">Capabilities</div>
                    <div className="flex flex-wrap gap-2">
                        {((service.metadata as { capabilities?: string[] })?.capabilities || [service.type || 'tools']).map((cap: string) => (
                            <span key={cap} className="px-2 py-1 text-xs font-mono border border-gray-700 text-gray-400 bg-gray-900 rounded">
                                {cap}
                            </span>
                        ))}
                    </div>
                </div>
            </div>

            {/* Footer */}
            <div className="p-6 border-t border-grid-line bg-[#0a0a0a]">
                <button className="w-full py-3 bg-neon-cyan/10 hover:bg-neon-cyan/20 border border-neon-cyan text-neon-cyan font-mono text-sm tracking-wider transition-all uppercase flex items-center justify-center group">
                    <span>Connect Node</span>
                    <svg className="w-4 h-4 ml-2 transform group-hover:translate-x-1 transition-transform" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7l5 5m0 0l-5 5m5-5H6" />
                    </svg>
                </button>
            </div>
        </div>
    );
};

export default ServiceDetail;
