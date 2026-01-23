/**
 * Cache Warmup Module
 *
 * @description Pre-populate cache on startup to achieve <3s cold start
 * @see Task-23: Create warmup module
 * @see Vol.6 §3.3: Cache Warmup Strategy
 */
/**
 * Warmup mode options
 */
export type WarmupMode = 'full' | 'lazy' | 'skip';
/**
 * Warmup result metrics
 */
export interface WarmupResult {
    mode: WarmupMode;
    success: boolean;
    cached: {
        services: number;
        reputations: number;
    };
    duration: number;
    errors: string[];
    timestamp: string;
}
/**
 * Warmup configuration
 */
export interface WarmupConfig {
    /** Mode: 'full' = preload all, 'lazy' = on-demand, 'skip' = bypass */
    mode: WarmupMode;
    /** Maximum services to preload in full mode */
    maxServices: number;
    /** Timeout for warmup operation (ms) */
    timeout: number;
    /** Concurrent batch size for RPC calls */
    batchSize: number;
}
/**
 * Execute cache warmup on startup
 *
 * @param config - Warmup configuration
 * @returns WarmupResult with metrics
 */
export declare function executeWarmup(config?: Partial<WarmupConfig>): Promise<WarmupResult>;
/**
 * Get warmup completion status
 */
export declare function isWarmupComplete(): boolean;
/**
 * Get warmup result (returns null if not completed)
 */
export declare function getWarmupResult(): WarmupResult | null;
/**
 * Get warmup metrics for health check
 */
export declare function getWarmupMetrics(): {
    completed: boolean;
    duration: number | null;
    success: boolean | null;
    cached: {
        services: number;
        reputations: number;
    } | null;
};
/**
 * Reset warmup state (for testing purposes)
 */
export declare function resetWarmupState(): void;
//# sourceMappingURL=warmup.d.ts.map