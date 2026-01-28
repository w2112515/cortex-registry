
import React from 'react';
import type { ServiceNode } from './NetworkGraph';
import ServiceCard from './ServiceCard';

interface ServiceListProps {
    services: ServiceNode[];
    onSelect: (node: ServiceNode) => void;
    className?: string;
}

const ServiceList: React.FC<ServiceListProps> = ({ services, onSelect, className = '' }) => {
    if (services.length === 0) {
        return (
            <div className={`flex flex-col items-center justify-center p-8 text-center ${className}`}>
                <div className="w-16 h-16 rounded-full bg-white/5 flex items-center justify-center mb-4">
                    <span className="text-2xl opacity-20">✦</span>
                </div>
                <h3 className="text-gray-400 font-display mb-2">No Services Found</h3>
                <p className="text-sm text-gray-600 font-mono">Try adjusting filters or search query</p>
            </div>
        );
    }

    return (
        <div className={`grid grid-cols-1 gap-4 p-4 pb-24 overflow-y-auto ${className}`}>
            {services.map((service) => (
                <ServiceCard
                    key={service.id}
                    service={service}
                    onClick={onSelect}
                />
            ))}

            <div className="h-8" /> {/* Extra padding at bottom for navigation usually */}
        </div>
    );
};

export default ServiceList;
