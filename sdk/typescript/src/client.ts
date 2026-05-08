import type { Packet, PacketOp, SubscriptionCallback } from './types.js';

// Use standard WebSocket if available (browser), else need 'ws' for Node
declare const WebSocket: any;

export interface VynClientOptions {
  url: string;
  username?: string; // Identity hint for initial handshake
  autoReconnect?: boolean;
  reconnectInterval?: number;
  maxReconnectAttempts?: number;
  autoSync?: boolean; // Automatically resubscribe and request replay on reconnect
  webSocketImpl?: any; // Custom WebSocket implementation (e.g., 'ws' for Node.js)
  getToken?: () => string | Promise<string>; // Factory for fetching tokens dynamically 
  useSSEFallback?: boolean; // If WS fails, try SSE
  sseUrl?: string; // SSE endpoint URL (defaults to url + /vynrelay/sse)
  eventSourceImpl?: any; // Custom EventSource implementation (for Node.js)
}

export class VynClient {
  private ws: any;
  private options: VynClientOptions & {
    autoReconnect: boolean;
    reconnectInterval: number;
    maxReconnectAttempts: number;
    autoSync: boolean;
  };
  private subscriptions: Map<string, Set<SubscriptionCallback>> = new Map();
  private messageQueue: Packet[] = [];
  private reconnectAttempts = 0;
  private _isConnected = false;
  private isIntentionallyClosed = false;
  private clientId?: string;
  private _transport: 'ws' | 'sse' = 'ws';
  private eventSource: any = null;
  
  // State tracking for offline sync
  private lastMessageIdPerTopic: Map<string, string> = new Map();
  private processedMessageIds: Set<string> = new Set();
  private readonly maxProcessedIds = 1000;
  public get isConnected(): boolean {
    return this._isConnected;
  }

  public get transport(): 'ws' | 'sse' {
    return this._transport;
  }

  constructor(options: VynClientOptions) {
    this.options = {
      autoReconnect: true,
      reconnectInterval: 1000,
      maxReconnectAttempts: 10,
      autoSync: true,
      useSSEFallback: true,
      ...options,
    };
    this.connect();
  }

  private reconnectTimer: any = null;

  public connect() {
    if (this.reconnectTimer) {
        clearTimeout(this.reconnectTimer);
        this.reconnectTimer = null;
    }

    if (this._transport === 'sse') {
        return this.connectSse();
    }

    // Cleanup old socket if exists
    if (this.ws) {
        this.ws.onopen = null;
        this.ws.onmessage = null;
        this.ws.onclose = null;
        this.ws.onerror = null;
        try {
            if (this.ws.readyState === 0 || this.ws.readyState === 1) {
                this.ws.close();
            }
        } catch (e) {}
    }

    let url = this.options.url;
    if (this.options.username) {
      const joiner = url.includes('?') ? '&' : '?';
      url += `${joiner}x-username=${encodeURIComponent(this.options.username)}`;
    }

    console.log(`VynRelay: Connecting to ${url} (WS)...`);
    
    let WS: any;
    if (this.options.webSocketImpl) {
      WS = this.options.webSocketImpl;
    } else if (typeof window !== 'undefined' && window.WebSocket) {
      WS = window.WebSocket;
    } else {
      try {
        // @ts-ignore - 'ws' is optional and provided by the consumer if necessary
        WS = require('ws');
      } catch (e) {
        throw new Error('WebSocket implementation not found. Please provide webSocketImpl in options or install "ws" for Node.js environments.');
      }
    }

    this.ws = new WS(url);

    this.ws.onopen = async () => {
      console.log('VynRelay: Connected (WS)');
      this._isConnected = true;
      this._transport = 'ws';
      this.reconnectAttempts = 0;
      
      await this.authenticate();
      if (this.options.autoSync) this.syncState();
      this.flushQueue();
    };

    this.ws.onmessage = (event: any) => {
      this.handleMessage(event.data);
    };

    this.ws.onclose = () => {
      this._isConnected = false;
      if (!this.isIntentionallyClosed) {
        console.log('VynRelay: Disconnected (WS)');
        if (this.options.autoReconnect) {
            this.reconnect();
        }
      }
    };

    this.ws.onerror = (err: any) => {
      this._isConnected = false;
      console.error('VynRelay: WebSocket Error', err);
      // Many browsers fire onclose after onerror, but some don't or in different order.
      // Reconnect if autoReconnect is true and not already reconnecting.
      if (this.options.autoReconnect && !this.reconnectTimer && !this.isIntentionallyClosed) {
          this.reconnect();
      }
    };
  }

  private connectSse() {
    let baseUrl = this.options.url.replace(/^ws/, 'http');
    if (baseUrl.endsWith('/vynrelay')) {
        baseUrl = baseUrl.replace(/\/vynrelay$/, '');
    }
    let sseUrl = this.options.sseUrl || `${baseUrl}/vynrelay/sse`;
    
    if (this.options.username) {
        const joiner = sseUrl.includes('?') ? '&' : '?';
        sseUrl += `${joiner}x-username=${encodeURIComponent(this.options.username)}`;
    }

    let ES: any;
    if (this.options.eventSourceImpl) {
        ES = this.options.eventSourceImpl;
    } else if (typeof window !== 'undefined' && window.EventSource) {
        ES = window.EventSource;
    } else {
        console.error('VynRelay: EventSource not found. Please provide eventSourceImpl in options for Node.js environments.');
        return;
    }

    this.eventSource = new ES(sseUrl);

    this.eventSource.onopen = async () => {
        console.log('VynRelay: Connected (SSE)');
        this._isConnected = true;
        this.reconnectAttempts = 0;
        
        await this.authenticate();
        if (this.options.autoSync) this.syncState();
        this.flushQueue();
    };

    this.eventSource.onmessage = (event: any) => {
        this.handleMessage(event.data);
    };

    this.eventSource.onerror = (err: any) => {
        this._isConnected = false;
        console.error('VynRelay: SSE Error', err);
        if (this.options.autoReconnect) {
            this.reconnect();
        }
    };
  }

  private syncState() {
    console.log('VynRelay: Syncing state...');
    
    // 1. Resubscribe to all active topics
    for (const topic of this.subscriptions.keys()) {
      this.sendPacket({
        id: this.generateId(),
        op: 'SUB',
        topic,
        timestamp: Date.now(),
      });

      // 2. Request Replay if we have a last message ID
      const lastId = this.lastMessageIdPerTopic.get(topic);
      if (lastId) {
        console.log(`VynRelay: Requesting replay for ${topic} since ${lastId}`);
        this.requestReplay(topic, { sinceId: lastId });
      }
    }
  }

  private reconnect() {
    if (this.reconnectTimer) return; // Already scheduled
    
    this.reconnectAttempts++;

    if (this.reconnectAttempts >= (this.options.maxReconnectAttempts || 10) && this.options.useSSEFallback && this._transport === 'ws') {
        console.log('VynRelay: WebSocket failed consistently. Falling back to SSE...');
        this._transport = 'sse';
        this.reconnectAttempts = 0;
        this.connectSse();
        return;
    }

    const delay = Math.min((this.options.reconnectInterval || 1000) * Math.pow(2, this.reconnectAttempts), 30000);
    console.log(`VynRelay: Reconnecting in ${delay}ms... (Attempt ${this.reconnectAttempts})`);
    
    this.reconnectTimer = setTimeout(() => {
        this.reconnectTimer = null;
        this.connect();
    }, delay);
  }

  public async authenticate(token?: string) {
    let freshToken = token;
    if (!freshToken && this.options.getToken) {
      try {
        freshToken = await this.options.getToken();
      } catch (e) {
        console.error('VynRelay: Failed to retrieve auth token', e);
      }
    }

    if (freshToken) {
      this.sendPacket({
        id: this.generateId(),
        op: 'AUTH',
        payload: { token: freshToken },
        timestamp: Date.now()
      });
    }
  }

  private handleMessage(data: string) {
    try {
      const packet = JSON.parse(data) as Packet;
      
      // Deduplication check
      if (this.processedMessageIds.has(packet.id)) {
        return;
      }

      switch (packet.op) {
        case 'CONNACK':
          this.clientId = packet.payload.clientId;
          console.log(`VynRelay: Registered with ClientID ${this.clientId}`);
          break;
        case 'PUB':
          this.trackMessage(packet);
          this.notifySubscribers(packet.topic!, packet.payload);
          // If the server flagged ack:true, send acknowledgement back transparently
          if (packet.ack) {
            this.sendPacket({
              id: packet.id,
              op: 'ACK',
              timestamp: Date.now(),
            });
          }
          break;
        case 'ACK':
          // Server-level ACK (e.g. confirming AUTH or an ack:true publish from client)
          break;
        case 'ERROR':
          const err = packet.payload as { code?: number; message?: string };
          if (err?.code === 4001) {
            console.error('VynRelay: Authentication failed. Check your token.');
          } else {
            console.error('VynRelay: Server Error:', packet.payload);
          }
          break;
      }
    } catch (e) {
      console.error('VynRelay: Failed to parse message', e);
    }
  }

  private trackMessage(packet: Packet) {
    if (packet.topic) {
      this.lastMessageIdPerTopic.set(packet.topic, packet.id);
    }
    
    this.processedMessageIds.add(packet.id);
    if (this.processedMessageIds.size > this.maxProcessedIds) {
      // Very basic LRU: remove first element
      const first = this.processedMessageIds.values().next().value;
      if (first !== undefined) {
          this.processedMessageIds.delete(first);
      }
    }
  }

  private notifySubscribers(topic: string, payload: any) {
    // Current exact matching
    const exact = this.subscriptions.get(topic);
    if (exact) {
      exact.forEach(cb => cb(payload, topic));
    }

    // Hierarchical matching logic
    for (const [subTopic, handlers] of this.subscriptions.entries()) {
        if (this.topicMatch(subTopic, topic) && subTopic !== topic) {
            handlers.forEach(cb => cb(payload, topic));
        }
    }
  }

  private topicMatch(pattern: string, topic: string): boolean {
    if (pattern === topic) return true;
    if (pattern === '#') return true;
    const pParts = pattern.split('.');
    const tParts = topic.split('.');
    for (let i = 0; i < pParts.length; i++) {
        if (pParts[i] === '#') return true;
        if (pParts[i] === '*') {
            if (i >= tParts.length) return false;
            continue;
        }
        if (pParts[i] !== tParts[i]) return false;
    }
    return pParts.length === tParts.length;
  }

  subscribe(topic: string, callback: SubscriptionCallback) {
    if (!this.subscriptions.has(topic)) {
      this.subscriptions.set(topic, new Set());
      this.sendPacket({
        id: this.generateId(),
        op: 'SUB',
        topic,
        timestamp: Date.now(),
      });
    }
    this.subscriptions.get(topic)!.add(callback);
  }

  unsubscribe(topic: string, callback?: SubscriptionCallback) {
    const handlers = this.subscriptions.get(topic);
    if (!handlers) return;

    if (callback) {
      handlers.delete(callback);
    } else {
      handlers.clear();
    }

    if (handlers.size === 0) {
      this.subscriptions.delete(topic);
      this.sendPacket({
        id: this.generateId(),
        op: 'UNSUB',
        topic,
        timestamp: Date.now(),
      });
    }
  }

  publish(topic: string, payload: any, ack = false) {
    const packet: Packet = {
      id: this.generateId(),
      op: 'PUB',
      topic,
      payload,
      timestamp: Date.now(),
      ack,
    };
    this.sendPacket(packet);
  }

  private async sendPacket(packet: Packet) {
    if (this._isConnected) {
      if (this._transport === 'ws') {
        this.ws.send(JSON.stringify(packet));
      } else {
        // SSE fallback: send via HTTP POST
        let baseUrl = this.options.url.replace(/^ws/, 'http');
        if (baseUrl.endsWith('/vynrelay')) {
            baseUrl = baseUrl.replace(/\/vynrelay$/, '');
        }
        const packetUrl = `${baseUrl}/vynrelay/packet`;
        try {
            await fetch(packetUrl, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ clientId: this.clientId, packet }),
            });
        } catch (err) {
            console.error('VynRelay: Failed to send packet via HTTP', err);
        }
      }
    } else if (this.isIntentionallyClosed) {
      console.warn(`VynRelay: Dropped packet ${packet.id} (client is intentionally disconnected).`);
    } else {
      console.log(`VynRelay: Offline. Queuing packet ${packet.id}`);
      this.messageQueue.push(packet);
    }
  }

  private flushQueue() {
    if (this.messageQueue.length > 0) {
      console.log(`VynRelay: Flushing ${this.messageQueue.length} queued messages`);
      while (this.messageQueue.length > 0 && this._isConnected) {
        const packet = this.messageQueue.shift();
        if (packet) this.ws.send(JSON.stringify(packet));
      }
    }
  }

  requestReplay(topic: string, options: { sinceId?: string; sinceTimestamp?: number }) {
    this.sendPacket({
      id: this.generateId(),
      op: 'REPLAY',
      topic,
      payload: options,
      timestamp: Date.now(),
    });
  }

  disconnect() {
    // Prevent auto-reconnection upon intentional disconnect
    this.options.autoReconnect = false;
    this.isIntentionallyClosed = true;
    if (this.ws) {
      if (this.ws.readyState === 1 /* OPEN */) {
        this.ws.close();
      } else if (this.ws.readyState === 0 /* CONNECTING */) {
        // Suppress the 'ws' library emitting a misleading error event when aborted during connection
        this.ws.onerror = () => {};
        if (typeof this.ws.terminate === 'function') {
          this.ws.terminate();
        } else {
          this.ws.close();
        }
      }
    }
    if (this.eventSource) {
        this.eventSource.close();
    }
  }

  private generateId(): string {
    return Math.random().toString(36).substring(2, 9);
  }
}
