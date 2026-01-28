import { useEffect, useState, useRef } from 'react';

interface TerminalLogProps {
    logs: string[];
}

export default function TerminalLog({ logs }: TerminalLogProps) {
    const scrollRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        if (scrollRef.current) {
            scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
        }
    }, [logs]);

    return (
        <div className="w-full bg-black border border-green-500/30 rounded-lg p-4 font-mono text-xs h-32 overflow-y-auto relative shadow-[0_0_10px_rgba(34,197,94,0.1)] custom-scrollbar">
            <div className="absolute top-2 right-2 text-[10px] text-green-500/50 animate-pulse">TERMINAL_OUTPUT_V1</div>
            <div ref={scrollRef} className="space-y-1">
                {logs.map((log, i) => (
                    <div key={i} className="text-green-400 break-all animate-fade-in">
                        <span className="mr-2 opacity-50">{'>'}</span>
                        {log}
                    </div>
                ))}
                <div className="flex items-center text-green-500 animate-pulse mt-1">
                    <span className="mr-2 opacity-50">{'>'}</span>
                    <span className="w-2 h-4 bg-green-500 inline-block" />
                </div>
            </div>
            <style jsx>{`
            @keyframes fadeIn {
                from { opacity: 0; transform: translateY(2px); }
                to { opacity: 1; transform: translateY(0); }
            }
            .animate-fade-in {
                animation: fadeIn 0.3s ease-out forwards;
            }
            .custom-scrollbar::-webkit-scrollbar {
                width: 4px;
            }
            .custom-scrollbar::-webkit-scrollbar-track {
                background: #000;
            }
            .custom-scrollbar::-webkit-scrollbar-thumb {
                background: #22c55e;
                border-radius: 2px;
            }
        `}</style>
        </div>
    );
}
