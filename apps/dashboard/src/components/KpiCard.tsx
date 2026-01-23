import React from 'react';

interface KpiCardProps {
    title: string;
    value: string | number;
    trend?: 'up' | 'down' | 'stable';
    icon?: React.ReactNode;
    color?: 'cyan' | 'gold' | 'magenta' | 'violet';
}

const colorMap = {
    cyan: 'text-neon-cyan border-neon-cyan/30 bg-neon-cyan/5',
    gold: 'text-stellar-gold border-stellar-gold/30 bg-stellar-gold/5',
    magenta: 'text-neon-magenta border-neon-magenta/30 bg-neon-magenta/5',
    violet: 'text-neon-violet border-neon-violet/30 bg-neon-violet/5',
};

const KpiCard: React.FC<KpiCardProps> = ({
    title,
    value,
    trend = 'stable',
    color = 'cyan'
}) => {
    return (
        <div className={`relative p-4 rounded-lg border backdrop-blur-sm ${colorMap[color]} group transition-all duration-300 hover:bg-opacity-10`}>
            {/* Corner Accents */}
            <div className="absolute top-0 left-0 w-2 h-2 border-l border-t border-current opacity-50" />
            <div className="absolute top-0 right-0 w-2 h-2 border-r border-t border-current opacity-50" />
            <div className="absolute bottom-0 left-0 w-2 h-2 border-l border-b border-current opacity-50" />
            <div className="absolute bottom-0 right-0 w-2 h-2 border-r border-b border-current opacity-50" />

            {/* Title */}
            <div className="text-xs uppercase tracking-widest opacity-70 font-mono mb-1">
                {title}
            </div>

            {/* Value */}
            <div className="text-2xl font-display font-bold tracking-wide">
                {value}
            </div>

            {/* Trend Indicator (Optional) */}
            <div className="absolute top-4 right-4 opacity-50">
                {trend === 'up' && '▲'}
                {trend === 'down' && '▼'}
                {trend === 'stable' && '−'}
            </div>
        </div>
    );
};

export default KpiCard;
