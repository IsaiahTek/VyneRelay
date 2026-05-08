import { type IncomingMessage } from 'http';
import { type TopicConfig } from './types.js';
import type { PersistenceAdapter } from '../persistence/persistence-adapter.js';
export interface VynServerOptions {
    port: number;
    persistence?: PersistenceAdapter;
    /**
     * Called with the HTTP upgrade request. Return a user object (or truthy value)
     * to allow the connection, or null/false to reject it.
     * Use this for **cookie-based** auth (the browser sends cookies automatically
     * during the WS handshake, so you can verify the session here).
     */
    upgradeHandler?: (req: IncomingMessage) => Promise<any | null>;
    /**
     * Called after an AUTH packet is received. Return a user object (or truthy
     * value) to authenticate the client, or null/false to reject.
     * Use this for **bearer-token** auth (mobile apps, API clients, etc.).
     */
    authHandler?: (token: string) => Promise<boolean | any>;
    aclHandler?: (user: any, topic: string, action: 'read' | 'write') => Promise<boolean>;
}
export declare class VynServer {
    private wss;
    private httpServer;
    private sessions;
    private topicManager;
    private store;
    private topicConfigs;
    private options;
    private internalListeners;
    constructor(options: VynServerOptions);
    close(): Promise<void>;
    private handleHttpRequest;
    private handleSseConnection;
    private handlePacketSubmission;
    setTopicConfig(topic: string, config: TopicConfig): void;
    private getTopicConfig;
    internalSubscribe(topic: string, callback: (payload: any) => void): void;
    internalUnsubscribe(topic: string, callback: (payload: any) => void): void;
    private handleConnection;
    private handleDisconnect;
    private handleMessage;
    private rejectUnauthenticated;
    private handleAuth;
    private checkAcl;
    private handlePublish;
    private handleSubscribe;
    private handleUnsubscribe;
    private handleReplay;
    private handleClientAck;
    /**
     * Send a packet to a client and, when ackRequired is true,
     * arm a retry timer. If the client doesn't ACK within `ackTimeoutMs`,
     * we resend up to `maxDeliveryAttempts` times before giving up.
     */
    private sendWithAck;
    private send;
}
//# sourceMappingURL=engine.d.ts.map