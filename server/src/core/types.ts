import { z } from 'zod';

export const PacketOpSchema = z.enum([
  'CONNECT',
  'CONNACK',
  'PUB',
  'SUB',
  'UNSUB',
  'ACK',
  'PING',
  'PONG',
  'REPLAY',
  'ERROR',
  'AUTH',
]);

export type PacketOp = z.infer<typeof PacketOpSchema>;

export const PacketSchema = z.object({
  id: z.string(),
  op: PacketOpSchema,
  topic: z.string().optional(),
  payload: z.any().optional(),
  timestamp: z.number(),
  ack: z.boolean().optional(),
});

export type Packet = z.infer<typeof PacketSchema>;

export interface ClientSession {
  id: string;
  transport: 'ws' | 'sse';
  socket?: any; // WebSocket (present if transport === 'ws')
  sseResponse?: any; // http.ServerResponse (present if transport === 'sse')
  subscriptions: Set<string>;
  lastSeen: number;
  isAuthenticated: boolean;
  user?: any; // Will store the resolved AuthUser payload
  pendingAcks: Map<string, PendingAck>; // messageId -> pending delivery
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
  retention?: string; // e.g. "24h"
  ackRequired?: boolean;
  maxDeliveryAttempts?: number;  // default: 5
  ackTimeoutMs?: number;         // default: 5000ms
}
