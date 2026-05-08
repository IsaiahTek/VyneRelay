import type { SubscriptionCallback } from './types.js';
export interface VynClientOptions {
    url: string;
    autoReconnect?: boolean;
    reconnectInterval?: number;
    maxReconnectAttempts?: number;
    autoSync?: boolean;
    webSocketImpl?: any;
    getToken?: () => string | Promise<string>;
}
export declare class VynClient {
    private ws;
    private options;
    private subscriptions;
    private messageQueue;
    private reconnectAttempts;
    private isConnected;
    private isIntentionallyClosed;
    private clientId?;
    private lastMessageIdPerTopic;
    private processedMessageIds;
    private readonly maxProcessedIds;
    constructor(options: VynClientOptions);
    connect(): void;
    private syncState;
    private reconnect;
    authenticate(token?: string): Promise<void>;
    private handleMessage;
    private trackMessage;
    private notifySubscribers;
    private topicMatch;
    subscribe(topic: string, callback: SubscriptionCallback): void;
    unsubscribe(topic: string, callback?: SubscriptionCallback): void;
    publish(topic: string, payload: any, ack?: boolean): void;
    private sendPacket;
    private flushQueue;
    requestReplay(topic: string, options: {
        sinceId?: string;
        sinceTimestamp?: number;
    }): void;
    disconnect(): void;
    private generateId;
}
//# sourceMappingURL=client.d.ts.map