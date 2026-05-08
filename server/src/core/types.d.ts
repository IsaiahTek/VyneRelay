import { z } from 'zod';
export declare const PacketOpSchema: z.ZodEnum<{
    CONNECT: "CONNECT";
    CONNACK: "CONNACK";
    PUB: "PUB";
    SUB: "SUB";
    UNSUB: "UNSUB";
    ACK: "ACK";
    PING: "PING";
    PONG: "PONG";
    REPLAY: "REPLAY";
    ERROR: "ERROR";
    AUTH: "AUTH";
}>;
export type PacketOp = z.infer<typeof PacketOpSchema>;
export declare const PacketSchema: z.ZodObject<{
    id: z.ZodString;
    op: z.ZodEnum<{
        CONNECT: "CONNECT";
        CONNACK: "CONNACK";
        PUB: "PUB";
        SUB: "SUB";
        UNSUB: "UNSUB";
        ACK: "ACK";
        PING: "PING";
        PONG: "PONG";
        REPLAY: "REPLAY";
        ERROR: "ERROR";
        AUTH: "AUTH";
    }>;
    topic: z.ZodOptional<z.ZodString>;
    payload: z.ZodOptional<z.ZodAny>;
    timestamp: z.ZodNumber;
    ack: z.ZodOptional<z.ZodBoolean>;
}, z.core.$strip>;
export type Packet = z.infer<typeof PacketSchema>;
export interface ClientSession {
    id: string;
    transport: 'ws' | 'sse';
    socket?: any;
    sseResponse?: any;
    subscriptions: Set<string>;
    lastSeen: number;
    isAuthenticated: boolean;
    user?: any;
    pendingAcks: Map<string, PendingAck>;
}
export interface PendingAck {
    packet: Packet;
    attempts: number;
    timerId: ReturnType<typeof setTimeout>;
}
export interface MessageRecord {
    id: string;
    topic: string;
    payload: any;
    timestamp: number;
}
export interface TopicConfig {
    persistence?: boolean;
    retention?: string;
    ackRequired?: boolean;
    maxDeliveryAttempts?: number;
    ackTimeoutMs?: number;
}
//# sourceMappingURL=types.d.ts.map