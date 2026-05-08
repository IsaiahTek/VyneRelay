import type { MessageRecord } from '../core/types.js';
import type { PersistenceAdapter } from './persistence-adapter.js';
export declare class MemoryStore implements PersistenceAdapter {
    private messages;
    private readonly maxPerTopic;
    push(topic: string, message: MessageRecord): Promise<void>;
    getSince(topic: string, sinceId?: string, sinceTimestamp?: number): Promise<MessageRecord[]>;
}
//# sourceMappingURL=memory-store.d.ts.map