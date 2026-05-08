import { createServer, type IncomingMessage, type ServerResponse } from 'http';
import { parse } from 'url';
import { WebSocketServer, WebSocket } from 'ws';
import { nanoid } from 'nanoid';
import { PacketSchema, type TopicConfig, type ClientSession, type Packet } from './types.js';
import { TopicManager } from '../messaging/topic-manager.js';
import { MemoryStore } from '../persistence/memory-store.js';
import type { PersistenceAdapter } from '../persistence/persistence-adapter.js';

export interface VynServerOptions {
  port?: number;
  server?: any;
  persistence?: PersistenceAdapter;
  /**
   * Called with the HTTP upgrade request. Return a user object (or truthy value)
   * to allow the connection, or null/false to reject it.
   */
  upgradeHandler?: (req: IncomingMessage) => Promise<any | null>;
  /**
   * Called after an AUTH packet is received. Return a user object (or truthy
   * value) to authenticate the client, or null/false to reject.
   */
  authHandler?: (token: string) => Promise<boolean | any>;
  aclHandler?: (user: any, topic: string, action: 'read' | 'write') => Promise<boolean>;
}

export class VynServer {
  private wss: WebSocketServer;
  private httpServer: any;
  private sessions = new Map<string, ClientSession>();
  private topicManager = new TopicManager();
  private store: PersistenceAdapter;
  private topicConfigs = new Map<string, TopicConfig>();
  private options: VynServerOptions;
  private internalListeners = new Map<string, Set<(payload: any) => void>>();

  constructor(options: VynServerOptions) {
    this.options = options;
    this.store = options.persistence || new MemoryStore();
    this.wss = new WebSocketServer({ noServer: true });
    this.wss.on('connection', (ws: WebSocket, req: any) => {
      this.handleConnection(ws, req.__vynUser);
    });

    if (options.port) {
      this.httpServer = createServer();
      this.attach(this.httpServer);
      this.httpServer.listen(options.port, () => {
        if (process.env.NODE_ENV !== 'test') {
          console.log(`VynRelay Server started on port ${options.port} (WS + SSE)`);
        }
      });
    }
  }

  /**
   * Attaches VynRelay to an existing HTTP server.
   * This implements a "Total Intercept" to ensure absolute isolation.
   */
  public attach(server: any) {
    this.httpServer = server;
    
    // Capture and remove original NestJS/Express listeners
    const requestListeners = server.listeners('request').slice();
    const upgradeListeners = server.listeners('upgrade').slice();
    
    server.removeAllListeners('request');
    server.removeAllListeners('upgrade');

    // Master Request Listener
    server.on('request', (req: IncomingMessage, res: ServerResponse) => {
      const url = req.url || '';
      if (url.includes('/vynrelay')) {
        this.handleHttpRequest(req, res).catch(err => {
          console.error('VynRelay: Request error', err);
          if (!res.headersSent) { res.statusCode = 500; res.end('Internal Error'); }
        });
      } else {
        // Delegate back to NestJS
        for (const listener of requestListeners) {
          listener.call(server, req, res);
        }
      }
    });

    // Master Upgrade Listener
    server.on('upgrade', (req: IncomingMessage, socket: any, head: any) => {
      const url = req.url || '';
      if (url.includes('/vynrelay')) {
        this.handleUpgrade(req, socket, head);
      } else {
        // Delegate back to NestJS
        for (const listener of upgradeListeners) {
          listener.call(server, req, socket, head);
        }
      }
    });

    console.log('[VynRelay] >>> TOTAL INTERCEPT ACTIVE <<<');
  }

  public async close(): Promise<void> {
    return new Promise<void>((resolve) => {
      this.wss.close();
      if (this.httpServer && this.httpServer.listening) {
        this.httpServer.close(() => resolve());
      } else {
        resolve();
      }
    });
  }

  private async handleUpgrade(req: IncomingMessage, socket: any, head: any) {
    try {
      let user = null;
      if (this.options.upgradeHandler) {
        user = await this.options.upgradeHandler(req);
        if (!user) {
          socket.write('HTTP/1.1 401 Unauthorized\r\n\r\n');
          socket.destroy();
          return;
        }
      }
      (req as any).__vynUser = user;
      this.wss.handleUpgrade(req, socket, head, (ws) => {
        this.wss.emit('connection', ws, req);
      });
    } catch (err) {
      console.error('VynRelay: upgrade error:', err);
      socket.write('HTTP/1.1 500 Internal Server Error\r\n\r\n');
      socket.destroy();
    }
  }

  private async handleHttpRequest(req: IncomingMessage, res: ServerResponse) {
    const parsedUrl = parse(req.url || '', true);
    const pathname = parsedUrl.pathname || '';
    const normalizedPath = pathname.replace(/\/vynrelay\/vynrelay/, '/vynrelay');

    // Handle CORS Preflight
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, x-username');

    if (req.method === 'OPTIONS') {
      res.statusCode = 204;
      res.end();
      return;
    }

    if (normalizedPath === '/vynrelay/sse' && req.method === 'GET') {
      return this.handleSseConnection(req, res);
    }
    if (normalizedPath === '/vynrelay/packet' && req.method === 'POST') {
      return this.handlePacketSubmission(req, res);
    }

    res.statusCode = 404;
    res.end('Not Found');
  }

  private async handleSseConnection(req: IncomingMessage, res: ServerResponse) {
    let user = null;
    if (this.options.upgradeHandler) {
      try {
        user = await this.options.upgradeHandler(req);
        if (!user) {
          res.writeHead(401, { 'Access-Control-Allow-Origin': '*' });
          res.end('Unauthorized');
          return;
        }
      } catch (err) {
        res.writeHead(500, { 'Access-Control-Allow-Origin': '*' });
        res.end('Internal Server Error');
        return;
      }
    }

    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
      'Access-Control-Allow-Origin': '*',
    });

    const clientId = nanoid();
    const session: ClientSession = {
      id: clientId,
      transport: 'sse',
      sseResponse: res,
      subscriptions: new Set(),
      lastSeen: Date.now(),
      isAuthenticated: user != null || !this.options.authHandler,
      user: user,
      pendingAcks: new Map(),
    };

    this.sessions.set(clientId, session);
    const keepAliveId = setInterval(() => {
      this.send(clientId, { id: nanoid(), op: 'PING', timestamp: Date.now() });
    }, 30000);

    req.on('close', () => {
      clearInterval(keepAliveId);
      this.handleDisconnect(clientId);
    });

    this.send(clientId, {
      id: nanoid(),
      op: 'CONNACK',
      payload: { clientId },
      timestamp: Date.now(),
    });

    if ((res as any).flushHeaders) (res as any).flushHeaders();
  }

  private async handlePacketSubmission(req: IncomingMessage, res: ServerResponse) {
    let body = '';
    req.on('data', chunk => { body += chunk.toString(); });
    req.on('end', async () => {
      try {
        const { clientId, packet } = JSON.parse(body);
        if (!clientId || !packet) {
          res.writeHead(400); res.end('Bad Request'); return;
        }
        const session = this.sessions.get(clientId);
        if (!session) {
          res.writeHead(404); res.end('Session Not Found'); return;
        }
        await this.handleMessage(clientId, JSON.stringify(packet));
        res.writeHead(200); res.end('OK');
      } catch (err) {
        res.writeHead(400); res.end('Invalid JSON');
      }
    });
  }

  public setTopicConfig(topic: string, config: TopicConfig): void {
    this.topicConfigs.set(topic, config);
  }

  private getTopicConfig(topic: string): TopicConfig {
    return this.topicConfigs.get(topic) || { persistence: false };
  }

  public internalSubscribe(topic: string, callback: (payload: any) => void): void {
    if (!this.internalListeners.has(topic)) this.internalListeners.set(topic, new Set());
    this.internalListeners.get(topic)!.add(callback);
  }

  public internalUnsubscribe(topic: string, callback: (payload: any) => void): void {
    this.internalListeners.get(topic)?.delete(callback);
  }

  /**
   * Publishes a message to a topic from the server.
   */
  public async publish(topic: string, payload: any, options?: { id?: string; timestamp?: number }): Promise<void> {
    const packet: Packet = {
      id: options?.id || nanoid(),
      op: 'PUB',
      topic,
      payload,
      timestamp: options?.timestamp || Date.now(),
    };

    const config = this.getTopicConfig(topic);
    if (config.persistence) {
      await this.store.push(topic, {
        id: packet.id,
        topic: packet.topic!,
        payload: packet.payload,
        timestamp: packet.timestamp,
      });
    }

    const subscribers = this.topicManager.getMatchingSubscribers(topic);
    for (const subId of subscribers) {
      const outbound: Packet = { ...packet, ack: config.ackRequired };
      if (config.ackRequired) {
        this.sendWithAck(subId, outbound, {
          ackTimeoutMs: config.ackTimeoutMs || 5000,
          maxAttempts: config.maxDeliveryAttempts || 5,
        });
      } else {
        this.send(subId, outbound);
      }
    }

    const internal = this.internalListeners.get(topic);
    if (internal) {
      for (const cb of internal) {
        try { cb(payload); } catch (err) {}
      }
    }
  }


  private handleConnection(ws: WebSocket, upgradeUser: any) {
    const clientId = nanoid();
    const session: ClientSession = {
      id: clientId,
      transport: 'ws',
      socket: ws,
      subscriptions: new Set(),
      lastSeen: Date.now(),
      isAuthenticated: upgradeUser != null || !this.options.authHandler,
      user: upgradeUser,
      pendingAcks: new Map(),
    };

    this.sessions.set(clientId, session);
    ws.on('message', (data) => this.handleMessage(clientId, data.toString()));
    ws.on('close', () => this.handleDisconnect(clientId));
    ws.on('error', (err) => console.error(`Client ${clientId} error:`, err));

    this.send(clientId, {
      id: nanoid(),
      op: 'CONNACK',
      payload: { clientId },
      timestamp: Date.now(),
    });
  }

  private handleDisconnect(clientId: string) {
    const session = this.sessions.get(clientId);
    if (session) {
      for (const { timerId } of session.pendingAcks.values()) clearTimeout(timerId);
    }
    this.topicManager.unsubscribeAll(clientId);
    this.sessions.delete(clientId);
  }

  private async handleMessage(clientId: string, data: string) {
    try {
      const raw = JSON.parse(data);
      const packet = PacketSchema.parse(raw);
      const session = this.sessions.get(clientId);
      if (!session) return;
      session.lastSeen = Date.now();

      switch (packet.op) {
        case 'AUTH': await this.handleAuth(clientId, packet); break;
        case 'PUB': if (!session.isAuthenticated) return this.rejectUnauthenticated(clientId, packet.id); await this.handlePublish(clientId, packet); break;
        case 'SUB': if (!session.isAuthenticated) return this.rejectUnauthenticated(clientId, packet.id); await this.handleSubscribe(clientId, packet); break;
        case 'UNSUB': this.handleUnsubscribe(clientId, packet); break;
        case 'REPLAY': if (!session.isAuthenticated) return this.rejectUnauthenticated(clientId, packet.id); await this.handleReplay(clientId, packet); break;
        case 'PING': this.send(clientId, { id: packet.id, op: 'PONG', timestamp: Date.now() }); break;
        case 'ACK': this.handleClientAck(clientId, packet.id); break;
      }
      if (packet.ack) this.send(clientId, { id: packet.id, op: 'ACK', timestamp: Date.now() });
    } catch (err) {
      this.send(clientId, { id: nanoid(), op: 'ERROR', payload: { message: 'Invalid packet' }, timestamp: Date.now() });
    }
  }

  private rejectUnauthenticated(clientId: string, packetId: string) {
    this.send(clientId, { id: packetId, op: 'ERROR', payload: { code: 4001, message: 'Unauthorized' }, timestamp: Date.now() });
  }

  private async handleAuth(clientId: string, packet: Packet) {
    const session = this.sessions.get(clientId);
    if (!session) return;
    if (this.options.authHandler && packet.payload?.token) {
      try {
        const user = await this.options.authHandler(packet.payload.token);
        if (user) {
          session.isAuthenticated = true; session.user = user;
          this.send(clientId, { id: packet.id, op: 'ACK', timestamp: Date.now() }); return;
        }
      } catch (err) {}
    }
    this.rejectUnauthenticated(clientId, packet.id); this.handleDisconnect(clientId);
  }

  private async checkAcl(clientId: string, topic: string, action: 'read' | 'write') {
    const session = this.sessions.get(clientId);
    if (!session || !session.isAuthenticated) return false;
    if (this.options.aclHandler) {
      try { return await this.options.aclHandler(session.user, topic, action); } catch (err) { return false; }
    }
    return true;
  }

  private async handlePublish(clientId: string, packet: Packet) {
    if (!packet.topic) return;
    if (!(await this.checkAcl(clientId, packet.topic, 'write'))) {
      this.send(clientId, { id: packet.id, op: 'ERROR', payload: { code: 403, message: 'Forbidden' }, timestamp: Date.now() });
      return;
    }
    await this.publish(packet.topic, packet.payload, { id: packet.id, timestamp: packet.timestamp });
  }

  private async handleSubscribe(clientId: string, packet: Packet) {
    if (!packet.topic) return;
    if (!(await this.checkAcl(clientId, packet.topic, 'read'))) {
      this.send(clientId, { id: packet.id, op: 'ERROR', payload: { code: 403, message: 'Forbidden' }, timestamp: Date.now() }); return;
    }
    this.topicManager.subscribe(clientId, packet.topic);
  }

  private handleUnsubscribe(clientId: string, packet: Packet) {
    if (packet.topic) this.topicManager.unsubscribe(clientId, packet.topic);
  }

  private async handleReplay(clientId: string, packet: Packet) {
    if (!packet.topic) return;
    const messages = await this.store.getSince(packet.topic, packet.payload?.sinceId, packet.payload?.sinceTimestamp);
    for (const msg of messages) this.send(clientId, { id: msg.id, op: 'PUB', topic: msg.topic, payload: msg.payload, timestamp: msg.timestamp });
  }

  private handleClientAck(clientId: string, messageId: string) {
    const session = this.sessions.get(clientId);
    if (session) {
      const pending = session.pendingAcks.get(messageId);
      if (pending) { clearTimeout(pending.timerId); session.pendingAcks.delete(messageId); }
    }
  }

  private sendWithAck(clientId: string, packet: Packet, config: { ackTimeoutMs: number, maxAttempts: number }) {
    this.send(clientId, packet);
    const session = this.sessions.get(clientId); if (!session) return;
    const schedule = (attempt: number) => {
      return setTimeout(() => {
        const s = this.sessions.get(clientId); if (!s || !s.pendingAcks.has(packet.id)) return;
        if (attempt >= config.maxAttempts) { s.pendingAcks.delete(packet.id); return; }
        this.send(clientId, packet);
        const entry = s.pendingAcks.get(packet.id);
        if (entry) { entry.attempts = attempt + 1; entry.timerId = schedule(attempt + 1); }
      }, config.ackTimeoutMs);
    };
    session.pendingAcks.set(packet.id, { packet, attempts: 1, timerId: schedule(1) });
  }

  private send(clientId: string, packet: Packet) {
    const session = this.sessions.get(clientId); if (!session) return;
    if (session.transport === 'ws') {
      if (session.socket.readyState === WebSocket.OPEN) session.socket.send(JSON.stringify(packet));
    } else if (session.transport === 'sse') {
      try { session.sseResponse.write(`data: ${JSON.stringify(packet)}\n\n`); } catch (err) { this.handleDisconnect(clientId); }
    }
  }
}
