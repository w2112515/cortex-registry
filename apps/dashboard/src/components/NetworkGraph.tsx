'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import * as d3 from 'd3';

// ============ Types ============

export interface ServiceNode extends d3.SimulationNodeDatum {
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
    metadata?: Record<string, unknown> | null;
    // D3 simulation properties
    x?: number;
    y?: number;
    vx?: number;
    vy?: number;
    fx?: number | null;
    fy?: number | null;
    // UI properties
    type?: string;
    name?: string;
}

export interface ServiceLink extends d3.SimulationLinkDatum<ServiceNode> {
    source: ServiceNode | string;
    target: ServiceNode | string;
    strength: number;
}

interface NetworkGraphProps {
    className?: string;
    nodes?: ServiceNode[];
    searchQuery?: string;
    onNodeSelect?: (node: ServiceNode) => void;
}

// ============ Precision Constellation Colors (Task-26g) ============

const COLORS = {
    void: '#030303',
    platinum: '#E8E8E8',   // Stellar (80%+)
    electric: '#00D4FF',   // Healthy (60-79%)
    amber: '#FF9F1C',      // Moderate (40-59%)
    dim: '#4A4A4A',        // Low (<40%)
    red: '#FF4444',        // Challenged
    edge: 'rgba(255,255,255,0.08)',
    edgeHighlight: 'rgba(0,212,255,0.5)',
};

// ============ Mock Data (fallback for demo) ============

// ============ Visual Helpers ============

const generateLinks = (nodes: ServiceNode[]): ServiceLink[] => {
    const links: ServiceLink[] = [];
    nodes.forEach((node, i) => {
        const numLinks = Math.floor(Math.random() * 3) + 1;
        for (let j = 0; j < numLinks; j++) {
            const targetIdx = (i + 1 + Math.floor(Math.random() * (nodes.length - 2))) % nodes.length;
            if (targetIdx !== i) {
                links.push({
                    source: node.id,
                    target: nodes[targetIdx].id,
                    strength: 0.3 + Math.random() * 0.5,
                });
            }
        }
    });
    return links;
};

// ============ Utilities (Precision Constellation Style) ============

/** 
 * Get node color based on Bayesian Score
 * Precision Constellation: 极简 4 级色阶
 */
const getNodeColor = (node: ServiceNode): string => {
    if (node.state === 2) return COLORS.red; // Challenged
    // Normalize BigInt string (1e18) to 0-100
    const rawScore = Number(node.reputation?.bayesianScore || 0);
    const score = rawScore > 100 ? rawScore / 1e18 : rawScore;

    if (score >= 80) return COLORS.platinum;
    if (score >= 60) return COLORS.electric;
    if (score >= 40) return COLORS.amber;
    return COLORS.dim;
};

/**
 * Get node radius (3-8px based on Stake)
 * Precision Constellation: Logarithmic scale (100 CRO -> 3px, 100k CRO -> 8px)
 */
const getNodeRadius = (node: ServiceNode): number => {
    try {
        const stakeWei = BigInt(node.stake || '0');
        const stakeCRO = Number(stakeWei / BigInt(10 ** 18));

        const minStake = 100;
        const maxStake = 100000;
        const minRadius = 6;  // Increased from 3
        const maxRadius = 18; // Increased from 8

        if (stakeCRO <= minStake) return minRadius;
        if (stakeCRO >= maxStake) return maxRadius;

        // Log scale interpolation
        const range = maxRadius - minRadius;
        const logMin = Math.log(minStake);
        const logMax = Math.log(maxStake);
        const scale = (Math.log(stakeCRO) - logMin) / (logMax - logMin);

        return minRadius + (scale * range);
    } catch (e) {
        return 3; // Fallback
    }
};

/**
 * Check if node is a top performer (Stellar tier)
 */
const isTopNode = (node: ServiceNode): boolean => {
    const rawScore = Number(node.reputation?.bayesianScore || 0);
    const score = rawScore > 100 ? rawScore / 1e18 : rawScore;
    return score >= 80;
};

// ============ Component ============

export default function NetworkGraph({ className = '', nodes: externalNodes = [], searchQuery = '', onNodeSelect }: NetworkGraphProps) {
    const svgRef = useRef<SVGSVGElement>(null);
    const containerRef = useRef<HTMLDivElement>(null);
    const [dimensions, setDimensions] = useState({ width: 0, height: 0 });
    const [hoveredNode, setHoveredNode] = useState<ServiceNode | null>(null);
    const [mousePos, setMousePos] = useState({ x: 0, y: 0 });

    // Handle resize
    useEffect(() => {
        const updateDimensions = () => {
            if (containerRef.current) {
                setDimensions({
                    width: containerRef.current.clientWidth,
                    height: containerRef.current.clientHeight,
                });
            }
        };

        updateDimensions();
        window.addEventListener('resize', updateDimensions);
        return () => window.removeEventListener('resize', updateDimensions);
    }, []);

    // Check if two nodes are connected
    const createConnectionMap = useCallback((links: ServiceLink[], nodes: ServiceNode[]) => {
        const nodeMap = new Map(nodes.map(n => [n.id, n]));
        const connections = new Map<string, Set<string>>();

        nodes.forEach(n => connections.set(n.id, new Set()));

        links.forEach(link => {
            const sourceId = typeof link.source === 'string' ? link.source : link.source.id;
            const targetId = typeof link.target === 'string' ? link.target : link.target.id;
            connections.get(sourceId)?.add(targetId);
            connections.get(targetId)?.add(sourceId);
        });

        return { nodeMap, connections };
    }, []);

    // Initialize D3 Radial Layout (Precision Constellation)
    useEffect(() => {
        if (!svgRef.current || dimensions.width === 0) return;

        const svg = d3.select(svgRef.current);
        svg.selectAll('*').remove();

        const { width, height } = dimensions;
        const centerX = width / 2;
        const centerY = height / 2;
        const maxRadius = Math.min(width, height) / 2 - 80;

        // Use external nodes
        const nodes = externalNodes.map(n => ({ ...n }));
        const links = generateLinks(nodes);
        const { connections } = createConnectionMap(links, nodes);

        // Sort nodes by reputation (highest first for center positioning)
        nodes.sort((a, b) => {
            const scoreA = Number(a.reputation?.bayesianScore || 0);
            const scoreB = Number(b.reputation?.bayesianScore || 0);
            return scoreB - scoreA;
        });

        // Calculate max score for scaling
        const maxScore = Math.max(...nodes.map(n => {
            const s = Number(n.reputation?.bayesianScore || 0);
            return s > 100 ? s / 1e18 : s;
        }));

        // Radial Scale: higher score = closer to center
        const radialScale = d3.scaleLinear()
            .domain([maxScore, 0])
            .range([50, maxRadius]);

        // Apply radial layout positions
        nodes.forEach((node, i) => {
            const angle = (i / nodes.length) * 2 * Math.PI - Math.PI / 2; // Start from top
            const rawScore = Number(node.reputation?.bayesianScore || 0);
            const score = rawScore > 100 ? rawScore / 1e18 : rawScore;
            const radius = radialScale(score);
            node.x = centerX + radius * Math.cos(angle);
            node.y = centerY + radius * Math.sin(angle);
        });

        // Create container group
        const g = svg.append('g');

        // Zoom behavior
        const zoom = d3.zoom<SVGSVGElement, unknown>()
            .scaleExtent([0.3, 3])
            .on('zoom', (event: d3.D3ZoomEvent<SVGSVGElement, unknown>) => {
                g.attr('transform', event.transform.toString());
            });

        svg.call(zoom);

        // Draw links (极淡连线)
        const linkGroup = g.append('g').attr('class', 'links');
        const linkElements = linkGroup.selectAll('line')
            .data(links)
            .enter()
            .append('line')
            .attr('class', 'edge-line')
            .attr('stroke', COLORS.edge)
            .attr('stroke-width', 0.5)
            .attr('x1', d => {
                const source = nodes.find(n => n.id === (typeof d.source === 'string' ? d.source : d.source.id));
                return source?.x ?? 0;
            })
            .attr('y1', d => {
                const source = nodes.find(n => n.id === (typeof d.source === 'string' ? d.source : d.source.id));
                return source?.y ?? 0;
            })
            .attr('x2', d => {
                const target = nodes.find(n => n.id === (typeof d.target === 'string' ? d.target : d.target.id));
                return target?.x ?? 0;
            })
            .attr('y2', d => {
                const target = nodes.find(n => n.id === (typeof d.target === 'string' ? d.target : d.target.id));
                return target?.y ?? 0;
            });

        // Draw nodes (精密微点风格)
        const nodeGroup = g.append('g').attr('class', 'nodes');
        const nodeElements = nodeGroup.selectAll('g')
            .data(nodes)
            .enter()
            .append('g')
            .attr('class', 'star-node')
            .style('filter', 'url(#glow)') // Add Neon Glow
            .attr('transform', d => `translate(${d.x}, ${d.y})`)
            .call(d3.drag<SVGGElement, ServiceNode>()
                .on('start', function (event, d) {
                    d3.select(this).raise();
                })
                .on('drag', function (event, d) {
                    d.x = event.x;
                    d.y = event.y;
                    d3.select(this).attr('transform', `translate(${d.x}, ${d.y})`);
                    // Update connected links
                    linkElements
                        .attr('x1', link => {
                            const sourceId = typeof link.source === 'string' ? link.source : link.source.id;
                            return sourceId === d.id ? (d.x ?? 0) : (nodes.find(n => n.id === sourceId)?.x ?? 0);
                        })
                        .attr('y1', link => {
                            const sourceId = typeof link.source === 'string' ? link.source : link.source.id;
                            return sourceId === d.id ? (d.y ?? 0) : (nodes.find(n => n.id === sourceId)?.y ?? 0);
                        })
                        .attr('x2', link => {
                            const targetId = typeof link.target === 'string' ? link.target : link.target.id;
                            return targetId === d.id ? (d.x ?? 0) : (nodes.find(n => n.id === targetId)?.x ?? 0);
                        })
                        .attr('y2', link => {
                            const targetId = typeof link.target === 'string' ? link.target : link.target.id;
                            return targetId === d.id ? (d.y ?? 0) : (nodes.find(n => n.id === targetId)?.y ?? 0);
                        });
                }));

        // Stellar ring (仅 Stellar 节点有微弱外环)
        nodeElements.filter(d => isTopNode(d))
            .append('circle')
            .attr('class', 'stellar-ring')
            .attr('r', d => getNodeRadius(d) + 4)
            .attr('fill', 'none')
            .attr('stroke', 'rgba(255,255,255,0.3)')
            .attr('stroke-width', 1)
            .style('animation', 'pulse 3s ease-in-out infinite');

        // Core node (微点 3-6px)
        nodeElements.append('circle')
            .attr('class', 'node-core')
            .attr('r', d => getNodeRadius(d))
            .attr('fill', d => getNodeColor(d))
            .attr('stroke', d => isTopNode(d) ? 'rgba(255,255,255,0.3)' : 'none')
            .attr('stroke-width', 1);

        // Spotlight Hover Effect
        nodeElements
            .on('mouseenter', function (event, d) {
                d3.select(this).raise();

                // 当前节点高亮
                d3.select(this).select('.node-core')
                    .transition()
                    .duration(200)
                    .attr('r', getNodeRadius(d) * 1.5);

                // 其他节点变暗 (Spotlight Effect)
                const connectedSet = connections.get(d.id) ?? new Set();
                nodeGroup.selectAll('.star-node')
                    .filter((n: unknown) => {
                        const node = n as ServiceNode;
                        return node.id !== d.id && !connectedSet.has(node.id);
                    })
                    .transition()
                    .duration(200)
                    .attr('opacity', 0.15);

                // 高亮相连路径
                linkElements
                    .filter(e => {
                        const sourceId = typeof e.source === 'string' ? e.source : e.source.id;
                        const targetId = typeof e.target === 'string' ? e.target : e.target.id;
                        return sourceId === d.id || targetId === d.id;
                    })
                    .transition()
                    .duration(200)
                    .attr('stroke', COLORS.edgeHighlight)
                    .attr('stroke-width', 1);

                setHoveredNode(d);
                setMousePos({ x: event.pageX, y: event.pageY });
            })
            .on('mousemove', (event) => {
                setMousePos({ x: event.pageX, y: event.pageY });
            })
            .on('mouseleave', function (event, d) {
                // 恢复节点状态
                d3.select(this).select('.node-core')
                    .transition()
                    .duration(200)
                    .attr('r', getNodeRadius(d));

                // 恢复所有节点
                nodeGroup.selectAll('.star-node')
                    .transition()
                    .duration(200)
                    .attr('opacity', 1);

                // 恢复连线
                linkElements
                    .transition()
                    .duration(200)
                    .attr('stroke', COLORS.edge)
                    .attr('stroke-width', 0.5);

                setHoveredNode(null);
            })
            .on('click', (event, d) => {
                event.stopPropagation();
                onNodeSelect?.(d);
            });

        // Highlight searched nodes
        if (searchQuery) {
            const query = searchQuery.toLowerCase();
            nodeElements.each(function (d) {
                const name = ((d.metadata as { name?: string })?.name ?? '').toLowerCase();
                const matches = name.includes(query);
                d3.select(this)
                    .classed('star-node-highlighted', matches)
                    .attr('opacity', matches ? 1 : 0.3);
            });
        }

        // Add concentric circle guides (极淡同心圆参考线)
        const guideGroup = g.insert('g', ':first-child').attr('class', 'guides');
        [0.25, 0.5, 0.75, 1].forEach(ratio => {
            guideGroup.append('circle')
                .attr('cx', centerX)
                .attr('cy', centerY)
                .attr('r', maxRadius * ratio)
                .attr('fill', 'none')
                .attr('stroke', 'rgba(255,255,255,0.02)')
                .attr('stroke-width', 1);
        });

    }, [dimensions, externalNodes, searchQuery, onNodeSelect, createConnectionMap]);

    return (
        <div ref={containerRef} className={`relative w-full h-full void-canvas ${className}`}>
            {/* SVG Defs for Glow Effects */}
            <svg className="absolute w-0 h-0">
                <defs>
                    <filter id="glow" x="-50%" y="-50%" width="200%" height="200%">
                        <feGaussianBlur stdDeviation="3.5" result="coloredBlur" />
                        <feMerge>
                            <feMergeNode in="coloredBlur" />
                            <feMergeNode in="SourceGraphic" />
                        </feMerge>
                    </filter>
                    <style>
                        {`
                            @keyframes pulse {
                                0%, 100% { opacity: 0.3; transform: scale(1); }
                                50% { opacity: 0.6; transform: scale(1.1); }
                            }
                            .grid-background {
                                mask-image: radial-gradient(circle at center, black 0%, transparent 80%);
                            }
                        `}
                    </style>
                    <pattern id="grid" width="40" height="40" patternUnits="userSpaceOnUse">
                        <path d="M 40 0 L 0 0 0 40" fill="none" stroke="rgba(255,255,255,0.03)" strokeWidth="1" />
                    </pattern>
                </defs>
            </svg>

            {/* Background Grid */}
            <svg className="absolute inset-0 w-full h-full pointer-events-none">
                <rect width="100%" height="100%" fill="url(#grid)" />
                <rect width="100%" height="100%" fill="radial-gradient(circle at 50% 50%, transparent 0%, #030303 100%)" />
            </svg>

            {/* Main SVG */}
            <svg
                ref={svgRef}
                width={dimensions.width}
                height={dimensions.height}
                className="cursor-grab active:cursor-grabbing relative z-10"
            />

            {/* Hover Tooltip */}
            {hoveredNode && (
                <div
                    className="glass-panel fixed z-50 p-4 min-w-[280px] pointer-events-none rounded-lg"
                    style={{
                        left: mousePos.x + 20,
                        top: mousePos.y - 10,
                        transform: mousePos.x > dimensions.width * 0.7 ? 'translateX(-320px)' : 'none',
                    }}
                >
                    <div className="flex items-center gap-3 mb-3">
                        <div
                            className="w-3 h-3 rounded-full"
                            style={{
                                backgroundColor: getNodeColor(hoveredNode),
                            }}
                        />
                        <h3 className="font-display text-lg text-signal-platinum">
                            {(hoveredNode.metadata as { name?: string })?.name || 'Unknown Service'}
                        </h3>
                    </div>

                    <div className="space-y-2 font-mono text-sm">
                        <div className="flex justify-between">
                            <span className="text-signal-dim">Reputation</span>
                            <span className="text-signal-electric font-medium">
                                {(Number(hoveredNode.reputation?.bayesianScore || 0) / 1e18).toFixed(1)}%
                            </span>
                        </div>
                        <div className="flex justify-between">
                            <span className="text-signal-dim">Rank</span>
                            <span className="text-signal-platinum">
                                #{hoveredNode.reputation?.rank ?? '-'}
                            </span>
                        </div>
                        <div className="flex justify-between">
                            <span className="text-signal-dim">Stake</span>
                            <span className="text-signal-amber">
                                {(Number(BigInt(hoveredNode.stake) / BigInt(10 ** 18))).toLocaleString()} CRO
                            </span>
                        </div>
                        <div className="flex justify-between">
                            <span className="text-signal-dim">Calls</span>
                            <span className="text-signal-platinum/70">
                                {hoveredNode.reputation?.totalCalls ?? 0}
                            </span>
                        </div>
                    </div>

                    <div className="mt-3 pt-3 border-t border-glass-border">
                        <div className="font-mono text-xs text-signal-dim truncate">
                            {hoveredNode.provider.slice(0, 10)}...{hoveredNode.provider.slice(-8)}
                        </div>
                    </div>
                </div>
            )}

            {/* Empty State */}
            {(!externalNodes || externalNodes.length === 0) && (
                <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                    <div className="text-center bg-void-black/80 p-8 rounded-xl backdrop-blur-md border border-glass-border">
                        <div className="text-6xl mb-4 opacity-20 text-signal-platinum animate-pulse">✦</div>
                        <h3 className="text-xl font-display text-signal-platinum mb-2">No Active Services</h3>
                        <p className="text-signal-dim max-w-xs mx-auto text-sm font-mono">
                            The constellation is waiting for new stars.
                            <br />
                            Register a service to ignite the network.
                        </p>
                    </div>
                </div>
            )}

            {/* Legend (Precision Constellation Style) - positioned above AgentActivityPanel */}
            <div className="absolute bottom-[200px] left-6 glass-panel p-4 rounded-lg pointer-events-auto">
                <h4 className="font-display text-sm text-signal-platinum mb-3 tracking-wider">
                    REPUTATION
                </h4>
                <div className="space-y-2 font-mono text-xs">
                    {[
                        { color: COLORS.platinum, label: 'Stellar (80%+)' },
                        { color: COLORS.electric, label: 'Healthy (60-79%)' },
                        { color: COLORS.amber, label: 'Moderate (40-59%)' },
                        { color: COLORS.dim, label: 'Low (<40%)' },
                    ].map(({ color, label }) => (
                        <div key={color} className="flex items-center gap-2">
                            <div
                                className="w-2 h-2 rounded-full"
                                style={{ backgroundColor: color }}
                            />
                            <span className="text-signal-platinum/60">{label}</span>
                        </div>
                    ))}
                </div>
            </div>
        </div>
    );
}
