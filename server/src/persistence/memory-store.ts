import type { MessageRecord } from '../core/types.js';
import type { PersistenceAdapter } from './persistence-adapter.js';

export class MemoryStore implements PersistenceAdapter {
  // topic -> Array of message records
  private messages: Map<string, MessageRecord[]> = new Map();
  private readonly maxPerTopic = 1000;

  async push(topic: string, message: MessageRecord): Promise<void> {
    if (!this.messages.has(topic)) {
      this.messages.set(topic, []);
    }
    const topicMessages = this.messages.get(topic)!;
    topicMessages.push(message);

    if (topicMessages.length > this.maxPerTopic) {
      topicMessages.shift();
    }
  }

  async getSince(topic: string, sinceId?: string, sinceTimestamp?: number): Promise<MessageRecord[]> {
    const topicMessages = this.messages.get(topic) || [];
    
    if (sinceId) {
      const index = topicMessages.findIndex(m => m.id === sinceId);
      if (index !== -1) {
        return topicMessages.slice(index + 1);
      }
    }

    if (sinceTimestamp) {
      return topicMessages.filter(m => m.timestamp > sinceTimestamp);
    }

    return topicMessages;
  }
}
