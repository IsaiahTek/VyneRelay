import { createRequire } from 'module';
const require = createRequire(import.meta.url);
export class VynClient {
    ws;
    options;
    subscriptions = new Map();
    messageQueue = [];
    reconnectAttempts = 0;
    isConnected = false;
    isIntentionallyClosed = false;
    clientId;
    // State tracking for offline sync
    lastMessageIdPerTopic = new Map();
    processedMessageIds = new Set();
    maxProcessedIds = 1000;
    constructor(options) {
        this.options = {
            autoReconnect: true,
            reconnectInterval: 1000,
            maxReconnectAttempts: 10,
            autoSync: true,
            ...options,
        };
        this.connect();
    }
    connect() {
        console.log(`VynRelay: Connecting to ${this.options.url}...`);
        let WS;
        if (this.options.webSocketImpl) {
            WS = this.options.webSocketImpl;
        }
        else if (typeof window !== 'undefined' && window.WebSocket) {
            WS = window.WebSocket;
        }
        else {
            try {
                // @ts-ignore - 'ws' is optional and provided by the consumer if necessary
                WS = require('ws');
            }
            catch (e) {
                throw new Error('WebSocket implementation not found. Please provide webSocketImpl in options or install "ws" for Node.js environments.');
            }
        }
        this.ws = new WS(this.options.url);
        this.ws.onopen = async () => {
            console.log('VynRelay: Connected');
            this.isConnected = true;
            this.reconnectAttempts = 0;
            // Dispatch dynamic Auth if present before flushing the queue
            await this.authenticate();
            if (this.options.autoSync) {
                this.syncState();
            }
            this.flushQueue();
        };
        this.ws.onmessage = (event) => {
            this.handleMessage(event.data);
        };
        this.ws.onclose = () => {
            this.isConnected = false;
            console.log('VynRelay: Disconnected');
            if (this.options.autoReconnect && this.reconnectAttempts < this.options.maxReconnectAttempts) {
                this.reconnect();
            }
        };
        this.ws.onerror = (err) => {
            console.error('VynRelay: WebSocket Error', err);
        };
    }
    syncState() {
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
    reconnect() {
        this.reconnectAttempts++;
        const delay = Math.min(this.options.reconnectInterval * Math.pow(2, this.reconnectAttempts), 30000);
        console.log(`VynRelay: Reconnecting in ${delay}ms... (Attempt ${this.reconnectAttempts})`);
        setTimeout(() => this.connect(), delay);
    }
    async authenticate(token) {
        let freshToken = token;
        if (!freshToken && this.options.getToken) {
            try {
                freshToken = await this.options.getToken();
            }
            catch (e) {
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
    handleMessage(data) {
        try {
            const packet = JSON.parse(data);
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
                    this.notifySubscribers(packet.topic, packet.payload);
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
                    const err = packet.payload;
                    if (err?.code === 4001) {
                        console.error('VynRelay: Authentication failed. Check your token.');
                    }
                    else {
                        console.error('VynRelay: Server Error:', packet.payload);
                    }
                    break;
            }
        }
        catch (e) {
            console.error('VynRelay: Failed to parse message', e);
        }
    }
    trackMessage(packet) {
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
    notifySubscribers(topic, payload) {
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
    topicMatch(pattern, topic) {
        if (pattern === topic)
            return true;
        if (pattern === '#')
            return true;
        const pParts = pattern.split('.');
        const tParts = topic.split('.');
        for (let i = 0; i < pParts.length; i++) {
            if (pParts[i] === '#')
                return true;
            if (pParts[i] === '*') {
                if (i >= tParts.length)
                    return false;
                continue;
            }
            if (pParts[i] !== tParts[i])
                return false;
        }
        return pParts.length === tParts.length;
    }
    subscribe(topic, callback) {
        if (!this.subscriptions.has(topic)) {
            this.subscriptions.set(topic, new Set());
            this.sendPacket({
                id: this.generateId(),
                op: 'SUB',
                topic,
                timestamp: Date.now(),
            });
        }
        this.subscriptions.get(topic).add(callback);
    }
    unsubscribe(topic, callback) {
        const handlers = this.subscriptions.get(topic);
        if (!handlers)
            return;
        if (callback) {
            handlers.delete(callback);
        }
        else {
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
    publish(topic, payload, ack = false) {
        const packet = {
            id: this.generateId(),
            op: 'PUB',
            topic,
            payload,
            timestamp: Date.now(),
            ack,
        };
        this.sendPacket(packet);
    }
    sendPacket(packet) {
        if (this.isConnected) {
            this.ws.send(JSON.stringify(packet));
        }
        else if (this.isIntentionallyClosed) {
            console.warn(`VynRelay: Dropped packet ${packet.id} (client is intentionally disconnected).`);
        }
        else {
            console.log(`VynRelay: Offline. Queuing packet ${packet.id}`);
            this.messageQueue.push(packet);
        }
    }
    flushQueue() {
        if (this.messageQueue.length > 0) {
            console.log(`VynRelay: Flushing ${this.messageQueue.length} queued messages`);
            while (this.messageQueue.length > 0 && this.isConnected) {
                const packet = this.messageQueue.shift();
                if (packet)
                    this.ws.send(JSON.stringify(packet));
            }
        }
    }
    requestReplay(topic, options) {
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
            }
            else if (this.ws.readyState === 0 /* CONNECTING */) {
                // Suppress the 'ws' library emitting a misleading error event when aborted during connection
                this.ws.onerror = () => { };
                if (typeof this.ws.terminate === 'function') {
                    this.ws.terminate();
                }
                else {
                    this.ws.close();
                }
            }
        }
    }
    generateId() {
        return Math.random().toString(36).substring(2, 9);
    }
}
//# sourceMappingURL=client.js.map