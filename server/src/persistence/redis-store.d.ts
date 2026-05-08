import type { PersistenceAdapter } from './persistence-adapter.js';
import type { MessageRecord } from '../core/types.js';
/**
 * RedisStore — A persistence adapter backed by Redis Sorted Sets (ZSet).
 *
 * Messages are stored as members of a ZSet keyed by `vynrelay:topic:<topic>`,
 * with the message timestamp as the score. This gives us O(log N) range queries
 * by time for the REPLAY feature.
 *
 * Pub/Sub Backplane:
 * A second Redis connection (`subscriber`) listens to broadcast events so that
 * when multiple VynServer instances are running, a PUB from one node is fanned
 * out to all other nodes through Redis and delivered to their local subscribers.
 */
export declare class RedisStore implements PersistenceAdapter {
    private client;
    private subscriber;
    private publishers;
    private readonly ttlSeconds;
    constructor(options?: {
        url?: string;
        ttlSeconds?: number;
    });
    /**
     * Store a message in the topic's ZSet and publish it to the backplane.
     */
    push(topic: string, record: MessageRecord): Promise<void>;
    /**
     * Retrieve messages since a given message ID or timestamp.
     */
    getSince(topic: string, sinceId?: string, sinceTimestamp?: number): Promise<MessageRecord[]>;
    /**
     * Subscribe to messages pushed by other server instances.
     * The callback is invoked whenever a new message arrives on this topic
     * from any node in the cluster.
     */
    subscribeToBackplane(topic: string, callback: (record: MessageRecord) => void): Promise<void>;
    unsubscribeFromBackplane(topic: string): Promise<void>;
    disconnect(): Promise<void>;
}
//# sourceMappingURL=redis-store.d.ts.map