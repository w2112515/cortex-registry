'use client';

import { useCallback, useEffect, useState } from 'react';
import {
    ReactFlow,
    Background,
    Controls,
    MiniMap,
    addEdge,
    useNodesState,
    useEdgesState,
    Handle,
    Position,
    BackgroundVariant,
} from '@xyflow/react';
import type { Node, Edge, Connection, NodeProps, NodeTypes } from '@xyflow/react';
import '@xyflow/react/dist/style.css';

// ============ Types ============

type ServiceNodeData = {
    label: string;
    bayesianScore: number;
    totalCalls: number;
    stake: string;
    provider: string;
    state: number;
};

type ServiceNode = Node<ServiceNodeData, 'service'>;

// ============ Custom Node Component ============

function ServiceFlowNode({ data }: NodeProps<ServiceNode>) {
    const getNodeColor = (score: number): string => {
        if (score >= 80) return 'border-signal-platinum';
        if (score >= 60) return 'border-signal-electric';
        if (score >= 40) return 'border-signal-amber';
        return 'border-signal-dim';
    };

    const getBgGlow = (score: number): string => {
        if (score >= 80) return 'shadow-[0_0_20px_rgba(232,232,232,0.3)]';
        if (score >= 60) return 'shadow-[0_0_20px_rgba(0,212,255,0.3)]';
        return '';
    };

    return (
        <div
            className={`glass-panel px-4 py-3 rounded-lg border-2 ${getNodeColor(data.bayesianScore)} ${getBgGlow(data.bayesianScore)} min-w-[160px]`}
        >
            <Handle type="target" position={Position.Top} className="w-3 h-3 !bg-signal-electric" />

            <div className="text-center">
                <h3 className="font-display text-sm text-signal-platinum font-medium truncate">
                    {data.label}
                </h3>
                <div className="mt-2 flex items-center justify-center gap-2">
                    <span className="text-xs font-mono text-signal-electric">
                        {data.bayesianScore}%
                    </span>
                    <span className="text-xs font-mono text-signal-dim">
                        ({data.totalCalls} calls)
                    </span>
                </div>
            </div>

            <Handle type="source" position={Position.Bottom} className="w-3 h-3 !bg-signal-electric" />
        </div>
    );
}

const nodeTypes: NodeTypes = {
    service: ServiceFlowNode,
};

// ============ API Types ============

interface ServiceFromAPI {
    id: string;
    provider: string;
    stake: string;
    state: number;
    reputation: {
        totalCalls: number;
        successCount: number;
        bayesianScore: number;
        rank: number;
    } | null;
    metadata?: {
        name?: string;
        [key: string]: unknown;
    } | null;
}

// ============ Component Props ============

interface WorkflowCanvasProps {
    className?: string;
}

// ============ Main Component ============

export default function WorkflowCanvas({ className = '' }: WorkflowCanvasProps) {
    const [nodes, setNodes, onNodesChange] = useNodesState<ServiceNode>([]);
    const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>([]);
    const [services, setServices] = useState<ServiceFromAPI[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);



    // Fetch services from Gateway
    useEffect(() => {
        const fetchServices = async () => {
            try {
                setIsLoading(true);
                const baseUrl = process.env.NEXT_PUBLIC_GATEWAY_URL || 'http://localhost:3001';
                const res = await fetch(`${baseUrl}/v1/discover`);

                if (res.status === 402) {
                    setError('Payment Required (402)');
                    setServices([]);
                    return;
                }

                if (!res.ok) {
                    throw new Error(`Failed to fetch: ${res.status}`);
                }

                const data = await res.json();
                const serviceList = data.services || data || [];

                setServices(serviceList);
                setError(null);
            } catch (err: any) {
                console.error('Failed to fetch services:', err);
                setError(err.message || 'Failed to connect to Gateway');
                setServices([]);
            } finally {
                setIsLoading(false);
            }
        };

        fetchServices();
    }, []);

    // Handle edge connections
    const onConnect = useCallback(
        (params: Connection) => {
            const newEdge: Edge = {
                id: `e${params.source}-${params.target}`,
                source: params.source!,
                target: params.target!,
                animated: true,
                style: { stroke: '#00D4FF', strokeWidth: 2 },
            };
            setEdges((eds) => addEdge(newEdge, eds));
        },
        [setEdges]
    );

    // Add a service node to canvas
    const addServiceNode = useCallback(
        (service: ServiceFromAPI) => {
            const existingNode = nodes.find((n) => n.id === service.id);
            if (existingNode) return;

            const newNode: ServiceNode = {
                id: service.id,
                type: 'service',
                position: {
                    x: 100 + Math.random() * 400,
                    y: 100 + Math.random() * 300,
                },
                data: {
                    label: service.metadata?.name || service.id.slice(0, 10) + '...',
                    bayesianScore: service.reputation?.bayesianScore ?? 50,
                    totalCalls: service.reputation?.totalCalls ?? 0,
                    stake: service.stake,
                    provider: service.provider,
                    state: service.state,
                },
            };

            setNodes((nds) => [...nds, newNode]);
        },
        [nodes, setNodes]
    );

    // Clear canvas
    const clearCanvas = useCallback(() => {
        setNodes([]);
        setEdges([]);
    }, [setNodes, setEdges]);

    return (
        <div className={`flex h-full w-full ${className}`}>
            {/* Service Panel (Left) */}
            <div className="w-64 h-full glass-panel border-r border-glass-border flex flex-col">
                <div className="p-4 border-b border-glass-border">
                    <h2 className="font-display text-lg text-signal-platinum">Services</h2>
                    <p className="text-xs text-signal-dim mt-1">Click to add to canvas</p>
                </div>

                <div className="flex-1 overflow-y-auto p-4 space-y-2">
                    {isLoading ? (
                        <div className="text-center text-signal-dim py-4">Loading...</div>
                    ) : error ? (
                        <div className="text-center text-signal-red py-4 text-sm">{error}</div>
                    ) : services.length === 0 ? (
                        <div className="text-center text-signal-dim py-4 text-sm">
                            No services available
                        </div>
                    ) : (
                        services.map((service) => {
                            const isOnCanvas = nodes.some((n) => n.id === service.id);
                            return (
                                <button
                                    key={service.id}
                                    onClick={() => addServiceNode(service)}
                                    disabled={isOnCanvas}
                                    className={`w-full text-left p-3 rounded-lg border transition-all ${isOnCanvas
                                        ? 'border-signal-dim/30 bg-void-deep/50 opacity-50 cursor-not-allowed'
                                        : 'border-glass-border bg-void-deep/30 hover:border-signal-electric hover:bg-void-deep/50'
                                        }`}
                                >
                                    <div className="font-mono text-sm text-signal-platinum truncate">
                                        {service.metadata?.name || service.id.slice(0, 12) + '...'}
                                    </div>
                                    <div className="flex items-center gap-2 mt-1">
                                        <span className="text-xs text-signal-electric">
                                            {service.reputation?.bayesianScore ?? 50}%
                                        </span>
                                        <span className="text-xs text-signal-dim">
                                            {service.reputation?.totalCalls ?? 0} calls
                                        </span>
                                    </div>
                                </button>
                            );
                        })
                    )}
                </div>
            </div>

            {/* Canvas (Center) */}
            <div className="flex-1 relative">
                <ReactFlow
                    nodes={nodes}
                    edges={edges}
                    onNodesChange={onNodesChange}
                    onEdgesChange={onEdgesChange}
                    onConnect={onConnect}
                    nodeTypes={nodeTypes}
                    fitView
                    className="void-canvas"
                >
                    <Background color="#1a1a1a" gap={20} variant={BackgroundVariant.Dots} />
                    <Controls className="!bg-void-deep !border-glass-border [&>button]:!bg-void-deep [&>button]:!border-glass-border [&>button]:!text-signal-platinum" />
                    <MiniMap
                        className="!bg-void-deep !border-glass-border"
                        nodeColor={(node) => {
                            const data = node.data as ServiceNodeData | undefined;
                            const score = data?.bayesianScore ?? 50;
                            if (score >= 80) return '#E8E8E8';
                            if (score >= 60) return '#00D4FF';
                            if (score >= 40) return '#FF9F1C';
                            return '#4A4A4A';
                        }}
                    />
                </ReactFlow>

                {/* Bottom Toolbar */}
                <div className="absolute bottom-4 left-1/2 -translate-x-1/2 flex items-center gap-3">
                    <button
                        onClick={clearCanvas}
                        className="glass-panel px-4 py-2 rounded-lg text-sm font-mono text-signal-platinum hover:border-signal-red transition-colors"
                    >
                        Clear
                    </button>
                    <button
                        onClick={() => {
                            const workflow = { nodes, edges };
                            console.log('Workflow:', JSON.stringify(workflow, null, 2));
                            alert('Workflow exported to console');
                        }}
                        className="glass-panel px-4 py-2 rounded-lg text-sm font-mono text-signal-electric hover:bg-signal-electric/10 transition-colors"
                    >
                        Export
                    </button>
                    <button
                        className="glass-panel px-6 py-2 rounded-lg text-sm font-mono bg-signal-electric/20 text-signal-electric border-signal-electric hover:bg-signal-electric/30 transition-colors"
                    >
                        Execute Workflow
                    </button>
                </div>

                {/* Empty State */}
                {nodes.length === 0 && (
                    <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                        <div className="text-center">
                            <div className="text-6xl mb-4 opacity-20">⬡</div>
                            <p className="text-signal-dim text-lg">
                                Click services from the left panel to add them
                            </p>
                            <p className="text-signal-dim/50 text-sm mt-2">
                                Connect nodes to define data flow
                            </p>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
}
