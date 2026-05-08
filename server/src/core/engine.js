import { createServer } from 'http';
import { parse } from 'url';
import { WebSocketServer, WebSocket } from 'ws';
import { nanoid } from 'nanoid';
import { PacketSchema } from './types.js';
import { TopicManager } from '../messaging/topic-manager.js';
import { MemoryStore } from '../persistence/memory-store.js';
export class VynServer {
    wss;
    httpServer;
    sessions = new Map();
    topicManager = new TopicManager();
    store;
    topicConfigs = new Map();
    options;
    internalListeners = new Map();
    constructor(options) {
        this.options = options;
        this.store = options.persistence || new MemoryStore();
        this.httpServer = createServer();
        this.httpServer.on('request', (req, res) => this.handleHttpRequest(req, res));
        this.wss = new WebSocketServer({ noServer: true });
        this.wss.on('connection', (ws, req) => {
            this.handleConnection(ws, req.__vynUser);
        });
        this.httpServer.on('upgrade', async (req, socket, head) => {
            const { pathname } = parse(req.url || '', true);
            // Only upgrade if it's the root path or WS-specific path
            if (pathname === '/' || pathname === '/vynrelay') {
                try {
                    let user = null;
                    if (options.upgradeHandler) {
                        user = await options.upgradeHandler(req);
                        if (!user) {
                            socket.write('HTTP/1.1 401 Unauthorized\r\n\r\n');
                            socket.destroy();
                            return;
                        }
                    }
                    req.__vynUser = user;
                    this.wss.handleUpgrade(req, socket, head, (ws) => {
                        this.wss.emit('connection', ws, req);
                    });
                }
                catch (err) {
                    console.error('VynRelay: upgrade error:', err);
                    socket.write('HTTP/1.1 500 Internal Server Error\r\n\r\n');
                    socket.destroy();
                }
            }
            else {
                socket.destroy();
            }
        });
        this.httpServer.listen(options.port, () => {
            // We use console.log only if not in test env to keep logs clean
            if (process.env.NODE_ENV !== 'test') {
                console.log(`VynRelay Server started on port ${options.port} (WS + SSE)`);
            }
        });
    }
    async close() {
        return new Promise((resolve) => {
            this.wss.close();
            this.httpServer.close(() => resolve());
        });
    }
    async handleHttpRequest(req, res) {
        const parsedUrl = parse(req.url || '', true);
        const pathname = parsedUrl.pathname;
        if (pathname === '/vynrelay/sse' && req.method === 'GET') {
            return this.handleSseConnection(req, res);
        }
        if (pathname === '/vynrelay/packet' && req.method === 'POST') {
            return this.handlePacketSubmission(req, res);
        }
        res.statusCode = 404;
        res.end('Not Found');
    }
    async handleSseConnection(req, res) {
        // 1. Auth check (optional upgradeHandler equivalent for SSE)
        let user = null;
        if (this.options.upgradeHandler) {
            try {
                user = await this.options.upgradeHandler(req);
                if (!user) {
                    res.writeHead(401);
                    res.end('Unauthorized');
                    return;
                }
            }
            catch (err) {
                res.writeHead(500);
                res.end('Internal Server Error');
                return;
            }
        }
        // 2. Setup SSE headers
        res.writeHead(200, {
            'Content-Type': 'text/event-stream',
            'Cache-Control': 'no-cache',
            'Connection': 'keep-alive',
            'Access-Control-Allow-Origin': '*', // Basic CORS for SSE
        });
        const clientId = nanoid();
        const isPreAuthenticated = user != null || !this.options.authHandler;
        const session = {
            id: clientId,
            transport: 'sse',
            sseResponse: res,
            subscriptions: new Set(),
            lastSeen: Date.now(),
            isAuthenticated: isPreAuthenticated,
            user: user,
            pendingAcks: new Map(),
        };
        this.sessions.set(clientId, session);
        console.log(`Client ${clientId} connected via SSE`);
        // Keep connection alive with a ping every 30s
        const keepAliveId = setInterval(() => {
            this.send(clientId, { id: nanoid(), op: 'PING', timestamp: Date.now() });
        }, 30000);
        req.on('close', () => {
            clearInterval(keepAliveId);
            this.handleDisconnect(clientId);
        });
        // Send initial CONNACK
        this.send(clientId, {
            id: nanoid(),
            op: 'CONNACK',
            payload: { clientId },
            timestamp: Date.now(),
        });
        // Ensure headers are flushed
        res.flushHeaders?.();
    }
    async handlePacketSubmission(req, res) {
        let body = '';
        req.on('data', chunk => { body += chunk.toString(); });
        req.on('end', async () => {
            try {
                const { clientId, packet } = JSON.parse(body);
                if (!clientId || !packet) {
                    res.writeHead(400);
                    res.end('Bad Request: Missing clientId or packet');
                    return;
                }
                const session = this.sessions.get(clientId);
                if (!session) {
                    res.writeHead(404);
                    res.end('Session Not Found');
                    return;
                }
                // Route to standard message handler
                await this.handleMessage(clientId, JSON.stringify(packet));
                res.writeHead(200);
                res.end('OK');
            }
            catch (err) {
                res.writeHead(400);
                res.end('Invalid JSON');
            }
        });
    }
    setTopicConfig(topic, config) {
        this.topicConfigs.set(topic, config);
    }
    getTopicConfig(topic) {
        // Default config: persistent if not specified? 
        // Or ephemeral by default? Let's go with ephemeral by default as per core principles.
        return this.topicConfigs.get(topic) || { persistence: false };
    }
    internalSubscribe(topic, callback) {
        if (!this.internalListeners.has(topic)) {
            this.internalListeners.set(topic, new Set());
        }
        this.internalListeners.get(topic).add(callback);
    }
    internalUnsubscribe(topic, callback) {
        this.internalListeners.get(topic)?.delete(callback);
    }
    handleConnection(ws, upgradeUser) {
        const clientId = nanoid();
        const isPreAuthenticated = upgradeUser != null || !this.options.authHandler;
        const session = {
            id: clientId,
            transport: 'ws',
            socket: ws,
            subscriptions: new Set(),
            lastSeen: Date.now(),
            isAuthenticated: isPreAuthenticated,
            user: upgradeUser,
            pendingAcks: new Map(),
        };
        this.sessions.set(clientId, session);
        ws.on('message', (data) => this.handleMessage(clientId, data));
        ws.on('close', () => this.handleDisconnect(clientId));
        ws.on('error', (err) => console.error(`Client ${clientId} error:`, err));
        // Send CONNACK
        this.send(clientId, {
            id: nanoid(),
            op: 'CONNACK',
            payload: { clientId },
            timestamp: Date.now(),
        });
    }
    handleDisconnect(clientId) {
        console.log(`Client ${clientId} disconnected`);
        // Cancel all pending ACK timers to avoid memory leaks
        const session = this.sessions.get(clientId);
        if (session) {
            for (const { timerId } of session.pendingAcks.values()) {
                clearTimeout(timerId);
            }
        }
        this.topicManager.unsubscribeAll(clientId);
        this.sessions.delete(clientId);
    }
    async handleMessage(clientId, data) {
        try {
            const raw = JSON.parse(data.toString());
            const packet = PacketSchema.parse(raw);
            const session = this.sessions.get(clientId);
            if (!session)
                return;
            session.lastSeen = Date.now();
            switch (packet.op) {
                case 'AUTH':
                    await this.handleAuth(clientId, packet);
                    break;
                case 'PUB':
                    if (!session.isAuthenticated)
                        return this.rejectUnauthenticated(clientId, packet.id);
                    await this.handlePublish(clientId, packet);
                    break;
                case 'SUB':
                    if (!session.isAuthenticated)
                        return this.rejectUnauthenticated(clientId, packet.id);
                    await this.handleSubscribe(clientId, packet);
                    break;
                case 'UNSUB':
                    this.handleUnsubscribe(clientId, packet);
                    break;
                case 'REPLAY':
                    if (!session.isAuthenticated)
                        return this.rejectUnauthenticated(clientId, packet.id);
                    await this.handleReplay(clientId, packet);
                    break;
                case 'PING':
                    this.send(clientId, { id: packet.id, op: 'PONG', timestamp: Date.now() });
                    break;
                case 'ACK':
                    this.handleClientAck(clientId, packet.id);
                    break;
                default:
                    console.warn(`Unhandled op: ${packet.op}`);
            }
            if (packet.ack) {
                this.send(clientId, { id: packet.id, op: 'ACK', timestamp: Date.now() });
            }
        }
        catch (err) {
            console.error(`Failed to handle message from ${clientId}:`, err);
            this.send(clientId, {
                id: nanoid(),
                op: 'ERROR',
                payload: { message: 'Invalid packet format' },
                timestamp: Date.now()
            });
        }
    }
    rejectUnauthenticated(clientId, packetId) {
        this.send(clientId, {
            id: packetId,
            op: 'ERROR',
            payload: { code: 4001, message: 'Unauthorized' },
            timestamp: Date.now()
        });
    }
    async handleAuth(clientId, packet) {
        const session = this.sessions.get(clientId);
        if (!session)
            return;
        if (this.options.authHandler && packet.payload?.token) {
            try {
                const user = await this.options.authHandler(packet.payload.token);
                if (user) {
                    session.isAuthenticated = true;
                    session.user = user;
                    this.send(clientId, { id: packet.id, op: 'ACK', timestamp: Date.now() });
                    return;
                }
            }
            catch (err) {
                console.error(`Auth failed for ${clientId}:`, err);
            }
        }
        this.rejectUnauthenticated(clientId, packet.id);
        this.handleDisconnect(clientId);
    }
    async checkAcl(clientId, topic, action) {
        const session = this.sessions.get(clientId);
        if (!session || !session.isAuthenticated)
            return false;
        if (this.options.aclHandler) {
            try {
                return await this.options.aclHandler(session.user, topic, action);
            }
            catch (err) {
                console.error(`ACL check error for ${clientId} on ${topic}:`, err);
                return false;
            }
        }
        return true;
    }
    async handlePublish(clientId, packet) {
        if (!packet.topic)
            return;
        if (!(await this.checkAcl(clientId, packet.topic, 'write'))) {
            this.send(clientId, { id: packet.id, op: 'ERROR', payload: { code: 403, message: 'Forbidden' }, timestamp: Date.now() });
            return;
        }
        const config = this.getTopicConfig(packet.topic);
        const record = {
            id: packet.id,
            topic: packet.topic,
            payload: packet.payload,
            timestamp: packet.timestamp,
        };
        // 1. Store (only if persistent)
        if (config.persistence) {
            await this.store.push(packet.topic, record);
        }
        // 2. Route to subscribers
        const subscribers = this.topicManager.getMatchingSubscribers(packet.topic);
        const ackRequired = config.ackRequired ?? false;
        const ackTimeoutMs = config.ackTimeoutMs ?? 5000;
        const maxAttempts = config.maxDeliveryAttempts ?? 5;
        for (const subId of subscribers) {
            const outbound = {
                id: packet.id,
                op: 'PUB',
                topic: packet.topic,
                payload: packet.payload,
                timestamp: packet.timestamp,
                ack: ackRequired,
            };
            if (ackRequired) {
                this.sendWithAck(subId, outbound, { ackTimeoutMs, maxAttempts });
            }
            else {
                this.send(subId, outbound);
            }
        }
        // 3. Trigger internal listeners
        const internal = this.internalListeners.get(packet.topic);
        if (internal) {
            for (const cb of internal) {
                try {
                    cb(packet.payload);
                }
                catch (err) {
                    console.error(`VynRelay: Internal listener error on ${packet.topic}:`, err);
                }
            }
        }
    }
    async handleSubscribe(clientId, packet) {
        if (!packet.topic)
            return;
        if (!(await this.checkAcl(clientId, packet.topic, 'read'))) {
            this.send(clientId, { id: packet.id, op: 'ERROR', payload: { code: 403, message: 'Forbidden' }, timestamp: Date.now() });
            return;
        }
        this.topicManager.subscribe(clientId, packet.topic);
        console.log(`Client ${clientId} subscribed to ${packet.topic}`);
    }
    handleUnsubscribe(clientId, packet) {
        if (!packet.topic)
            return;
        this.topicManager.unsubscribe(clientId, packet.topic);
    }
    async handleReplay(clientId, packet) {
        if (!packet.topic)
            return;
        const messages = await this.store.getSince(packet.topic, packet.payload?.sinceId, packet.payload?.sinceTimestamp);
        for (const msg of messages) {
            this.send(clientId, {
                id: msg.id,
                op: 'PUB',
                topic: msg.topic,
                payload: msg.payload,
                timestamp: msg.timestamp,
            });
        }
    }
    handleClientAck(clientId, messageId) {
        const session = this.sessions.get(clientId);
        if (!session)
            return;
        const pending = session.pendingAcks.get(messageId);
        if (pending) {
            clearTimeout(pending.timerId);
            session.pendingAcks.delete(messageId);
        }
    }
    /**
     * Send a packet to a client and, when ackRequired is true,
     * arm a retry timer. If the client doesn't ACK within `ackTimeoutMs`,
     * we resend up to `maxDeliveryAttempts` times before giving up.
     */
    sendWithAck(clientId, packet, config) {
        // Do the first delivery
        this.send(clientId, packet);
        const session = this.sessions.get(clientId);
        if (!session)
            return;
        const schedule = (attempt) => {
            const timerId = setTimeout(() => {
                const s = this.sessions.get(clientId);
                if (!s || !s.pendingAcks.has(packet.id))
                    return; // already ACK'd or disconnected
                if (attempt >= config.maxAttempts) {
                    console.warn(`VynRelay: Giving up delivery of ${packet.id} to ${clientId} after ${attempt} attempts.`);
                    s.pendingAcks.delete(packet.id);
                    return;
                }
                console.warn(`VynRelay: No ACK from ${clientId} for ${packet.id}, retrying (attempt ${attempt + 1})...`);
                this.send(clientId, packet);
                // Update the pending entry with the new timer
                const newEntry = s.pendingAcks.get(packet.id);
                if (newEntry) {
                    newEntry.attempts = attempt + 1;
                    newEntry.timerId = schedule(attempt + 1);
                }
            }, config.ackTimeoutMs);
            return timerId;
        };
        session.pendingAcks.set(packet.id, {
            packet,
            attempts: 1,
            timerId: schedule(1),
        });
    }
    send(clientId, packet) {
        const session = this.sessions.get(clientId);
        if (!session)
            return;
        if (session.transport === 'ws') {
            if (session.socket.readyState === WebSocket.OPEN) {
                session.socket.send(JSON.stringify(packet));
            }
        }
        else if (session.transport === 'sse') {
            try {
                session.sseResponse.write(`data: ${JSON.stringify(packet)}\n\n`);
            }
            catch (err) {
                console.error(`VynRelay: Failed to write to SSE stream for ${clientId}`, err);
                this.handleDisconnect(clientId);
            }
        }
    }
}
//# sourceMappingURL=engine.js.map