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
export const PacketSchema = z.object({
    id: z.string(),
    op: PacketOpSchema,
    topic: z.string().optional(),
    payload: z.any().optional(),
    timestamp: z.number(),
    ack: z.boolean().optional(),
});
//# sourceMappingURL=types.js.map