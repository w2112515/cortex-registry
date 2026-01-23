'use client';

import dynamic from 'next/dynamic';

// Dynamically import to avoid SSR issues with React Flow
const WorkflowCanvas = dynamic(
    () => import('@/components/WorkflowCanvas'),
    { ssr: false }
);

export default function WorkflowPage() {
    return (
        <main className="h-screen w-screen void-canvas">
            {/* Header */}
            <header className="fixed top-0 left-0 right-0 z-50 glass-panel border-b border-glass-border h-16 flex items-center px-6">
                <div className="flex items-center gap-4">
                    <a href="/" className="text-signal-dim hover:text-signal-platinum transition-colors">
                        ← Back
                    </a>
                    <div className="w-px h-6 bg-glass-border" />
                    <h1 className="font-display text-xl text-signal-platinum">
                        Workflow Builder
                    </h1>
                </div>
                <div className="ml-auto flex items-center gap-3">
                    <span className="text-xs font-mono text-signal-dim">
                        Visual MCP Service Orchestration
                    </span>
                </div>
            </header>

            {/* Canvas Area */}
            <div className="pt-16 h-full">
                <WorkflowCanvas className="h-full" />
            </div>
        </main>
    );
}
