/**
 * Redis Indexer Module
 *
 * @description Monitors on-chain events and synchronizes service data to Redis
 * @see Task-17: Redis Indexer
 * @see Vol.6 §2.1: Read Path (High Volume) - CQRS-Lite Pattern
 */
interface IndexerState {
    isRunning: boolean;
    lastProcessedBlock: bigint;
    processedEvents: number;
    unwatchFn: (() => void) | null;
}
declare const indexerState: IndexerState;
/**
 * Start the indexer
 */
export declare function startIndexer(): Promise<void>;
/**
 * Stop the indexer
 */
export declare function stopIndexer(): void;
/**
 * Get indexer status
 */
export declare function getIndexerStatus(): {
    isRunning: boolean;
    lastProcessedBlock: string;
    processedEvents: number;
};
export { indexerState };
//# sourceMappingURL=indexer.d.ts.map