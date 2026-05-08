import type { PersistenceAdapter } from './persistence-adapter.js';
import type { MessageRecord } from '../core/types.js';
import { Redis } from 'ioredis';

const DEFAULT_TTL_SECONDS = 60 * 60 * 24; // 24 hours

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
export class RedisStore implements PersistenceAdapter {
  private client: Redis;
  private subscriber: Redis;
  private publishers: Map<string, (record: MessageRecord) => void> = new Map();
  private readonly ttlSeconds: number;

  constructor(options?: { url?: string; ttlSeconds?: number }) {
    this.ttlSeconds = options?.ttlSeconds ?? DEFAULT_TTL_SECONDS;
    this.client = new Redis(options?.url ?? 'redis://localhost:6379');
    this.subscriber = new Redis(options?.url ?? 'redis://localhost:6379');

    this.subscriber.on('message', (channel: string, message: string) => {
      const topic = channel.replace('vynrelay:pub:', '');
      const record: MessageRecord = JSON.parse(message);
      const handler = this.publishers.get(topic);
      if (handler) handler(record);
    });
  }

  /**
   * Store a message in the topic's ZSet and publish it to the backplane.
   */
  async push(topic: string, record: MessageRecord): Promise<void> {
    const key = `vynrelay:topic:${topic}`;
    await this.client.zadd(key, record.timestamp, JSON.stringify(record));
    await this.client.expire(key, this.ttlSeconds);

    // Broadcast to other VynServer instances
    await this.client.publish(`vynrelay:pub:${topic}`, JSON.stringify(record));
  }

  /**
   * Retrieve messages since a given message ID or timestamp.
   */
  async getSince(
    topic: string,
    sinceId?: string,
    sinceTimestamp?: number
  ): Promise<MessageRecord[]> {
    const key = `vynrelay:topic:${topic}`;

    if (sinceId) {
      // When replaying since a message ID, we fetch all messages and filter.
      // For production at very high volumes, a separate ID-to-score index
      // should be maintained. This is sufficient for Phase 2.
      const all = await this.client.zrangebyscore(key, '-inf', '+inf');
      const records = all.map((r: string) => JSON.parse(r) as MessageRecord);
      const idx = records.findIndex((r: MessageRecord) => r.id === sinceId);
      return idx >= 0 ? records.slice(idx + 1) : records;
    }

    const minScore = sinceTimestamp ?? 0;
    const raw = await this.client.zrangebyscore(key, minScore, '+inf');
    return raw.map((r: string) => JSON.parse(r) as MessageRecord);
  }

  /**
   * Subscribe to messages pushed by other server instances.
   * The callback is invoked whenever a new message arrives on this topic
   * from any node in the cluster.
   */
  async subscribeToBackplane(
    topic: string,
    callback: (record: MessageRecord) => void
  ): Promise<void> {
    this.publishers.set(topic, callback);
    await this.subscriber.subscribe(`vynrelay:pub:${topic}`);
  }

  async unsubscribeFromBackplane(topic: string): Promise<void> {
    this.publishers.delete(topic);
    await this.subscriber.unsubscribe(`vynrelay:pub:${topic}`);
  }

  async disconnect(): Promise<void> {
    await this.subscriber.quit();
    await this.client.quit();
  }
}
