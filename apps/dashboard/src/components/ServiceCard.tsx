
import React from 'react';
import type { ServiceNode } from './NetworkGraph';
import { Star, Shield, Activity } from 'lucide-react';

interface ServiceCardProps {
    service: ServiceNode;
    onClick?: (service: ServiceNode) => void;
}

const STATE_CONFIG: Record<number, { label: string; color: string; border: string }> = {
    0: { label: 'PENDING', color: 'text-yellow-400', border: 'border-yellow-500/30' },
    1: { label: 'ACTIVE', color: 'text-green-400', border: 'border-green-500/30' },
    2: { label: 'CHALLENGED', color: 'text-orange-400', border: 'border-orange-500/30' },
    3: { label: 'SLASHED', color: 'text-red-500', border: 'border-red-500/30' },
    4: { label: 'WITHDRAWN', color: 'text-zinc-500', border: 'border-zinc-500/30' },
};

const ServiceCard: React.FC<ServiceCardProps> = ({ service, onClick }) => {
    const stateConfig = STATE_CONFIG[service.state] || STATE_CONFIG[0];
    const isSlashed = service.state === 3;
    const score = service.reputation?.bayesianScore ?? 0;

    // Determine card glow based on score/state
    const glowClass = isSlashed
        ? 'hover:shadow-[0_0_15px_rgba(239,68,68,0.2)] hover:border-red-500/50'
        : score >= 80
            ? 'hover:shadow-[0_0_15px_rgba(255,255,255,0.2)] hover:border-white/40'
            : 'hover:shadow-[0_0_15px_rgba(34,211,238,0.2)] hover:border-neon-cyan/40';

    return (
        <div
            onClick={() => onClick?.(service)}
            className={`
                relative p-4 rounded-lg bg-black/40 backdrop-blur-md 
                border border-white/5 service-card-transition cursor-pointer
                group overflow-hidden ${glowClass}
            `}
        >
            {/* Background Gradient */}
            <div className="absolute inset-0 bg-gradient-to-br from-white/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300" />

            {/* Slashed Overlay */}
            {isSlashed && (
                <div className="absolute inset-0 bg-red-900/10 pointer-events-none" />
            )}

            <div className="relative z-10 flex flex-col gap-3">
                {/* Header */}
                <div className="flex justify-between items-start">
                    <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                            <h3 className={`font-display font-bold truncate ${isSlashed ? 'text-red-400' : 'text-white group-hover:text-neon-cyan'}`}>
                                {service.name || 'Unknown Service'}
                            </h3>
                            {score >= 80 && !isSlashed && (
                                <Star className="w-3 h-3 text-stellar-gold fill-stellar-gold animate-pulse" />
                            )}
                        </div>
                        <div className="flex items-center gap-2 text-[10px] font-mono text-gray-500">
                            <span className={`px-1.5 py-0.5 rounded border ${stateConfig.border} ${stateConfig.color} bg-black/50`}>
                                {stateConfig.label}
                            </span>
                            <span className="truncate max-w-[100px]">{service.provider}</span>
                        </div>
                    </div>

                    {/* Score Ring */}
                    <div className="relative flex items-center justify-center w-10 h-10">
                        <svg className="absolute inset-0 w-full h-full -rotate-90">
                            <circle
                                cx="20" cy="20" r="14"
                                className="stroke-gray-800"
                                strokeWidth="2"
                                fill="none"
                            />
                            {!isSlashed && (
                                <circle
                                    cx="20" cy="20" r="14"
                                    className={`${score >= 80 ? 'stroke-stellar-gold' : 'stroke-neon-cyan'}`}
                                    strokeWidth="2"
                                    fill="none"
                                    strokeDasharray={88}
                                    strokeDashoffset={88 - (88 * score) / 100}
                                    strokeLinecap="round"
                                />
                            )}
                        </svg>
                        <span className={`text-[10px] font-bold ${isSlashed ? 'text-red-500' : 'text-white'}`}>
                            {isSlashed ? 'X' : score}
                        </span>
                    </div>
                </div>

                {/* Stats */}
                <div className="grid grid-cols-2 gap-2 mt-2 pt-2 border-t border-white/5">
                    <div className="flex items-center gap-1.5">
                        <Shield className="w-3 h-3 text-gray-500" />
                        <span className="text-xs font-mono text-gray-300">
                            {(Number(BigInt(service.stake || '0') / BigInt(10 ** 18))).toLocaleString()}
                        </span>
                        <span className="text-[10px] text-gray-600">CRO</span>
                    </div>
                    <div className="flex items-center gap-1.5 justify-end">
                        <Activity className="w-3 h-3 text-gray-500" />
                        <span className="text-xs font-mono text-gray-300">
                            {service.reputation?.totalCalls ?? 0}
                        </span>
                        <span className="text-[10px] text-gray-600">Calls</span>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default ServiceCard;
