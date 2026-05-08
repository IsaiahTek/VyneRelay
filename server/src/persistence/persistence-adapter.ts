import type { MessageRecord } from '../core/types.js';

export interface PersistenceAdapter {
  /**
   * Stores a message for a given topic.
   */
  push(topic: string, message: MessageRecord): Promise<void>;

  /**
   * Retrieves messages for a topic since a given ID or timestamp.
   */
  getSince(topic: string, sinceId?: string, sinceTimestamp?: number): Promise<MessageRecord[]>;

  /**
   * (Optional) Cleans up old messages based on retention policy.
   */
  cleanup?(topic: string, retention: string): Promise<void>;
}
